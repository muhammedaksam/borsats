import axios from "axios";

import { APIError, DataNotAvailableError } from "~/exceptions";
import { Fund } from "~/fund";
import {
  getKAPHoldingsProvider,
  KAPHoldingsProvider,
  OPENROUTER_MODEL,
  PORTFOLIO_REPORT_DISCLOSURE_TYPE,
} from "~/providers/kap-holdings";
import { getTEFASProvider } from "~/providers/tefas";

describe("KAPHoldingsProvider & Fund.getHoldings", () => {
  let provider: KAPHoldingsProvider;

  beforeEach(() => {
    provider = new KAPHoldingsProvider();
    jest.restoreAllMocks();
  });

  test("constants match borsapy", () => {
    expect(PORTFOLIO_REPORT_DISCLOSURE_TYPE).toBe(
      "8aca490d502e34b801502e380044002b",
    );
    expect(OPENROUTER_MODEL).toBe("google/gemini-3-flash-preview");
    expect(getKAPHoldingsProvider()).toBeInstanceOf(KAPHoldingsProvider);
  });

  test("getFundId extracts 32-hex objId from KAP page and caches it", async () => {
    jest.spyOn(getTEFASProvider(), "getFundDetail").mockResolvedValue({
      fund_code: "YAY",
      kap_link: "https://www.kap.org.tr/tr/fon-bilgileri/genel/yay",
    } as Awaited<ReturnType<ReturnType<typeof getTEFASProvider>["getFundDetail"]>>);

    const client = (provider as unknown as { client: { get: jest.Mock } })
      .client;
    const getSpy = jest.spyOn(client, "get").mockResolvedValueOnce({
      data: '<html>"objId":"33E5FED7E50300EAE0530A4A622B2AEA"</html>',
    });

    const id1 = await provider.getFundId("yay");
    expect(id1).toBe("33E5FED7E50300EAE0530A4A622B2AEA");

    // Second call uses cache
    const id2 = await provider.getFundId("YAY");
    expect(id2).toBe("33E5FED7E50300EAE0530A4A622B2AEA");
    expect(getSpy).toHaveBeenCalledTimes(1);
  });

  test("_downloadPdf strips Java serialization prefix before %PDF-", async () => {
    const client = (provider as unknown as { client: { get: jest.Mock } })
      .client;
    const raw = Buffer.concat([
      Buffer.from("JAVA_SERIAL_HEADER_BYTES___"),
      Buffer.from("%PDF-1.4\nbody"),
    ]);
    jest.spyOn(client, "get").mockResolvedValueOnce({ data: raw });

    const pdf = await provider._downloadPdf("a".repeat(32));
    expect(pdf?.toString("utf8").startsWith("%PDF-1.4")).toBe(true);

    jest
      .spyOn(client, "get")
      .mockResolvedValueOnce({ data: Buffer.from("NOT_A_PDF") });
    expect(await provider._downloadPdf("b".repeat(32))).toBeNull();
  });

  test("_parseLlmResponseText handles fenced JSON, Turkish numbers, .E suffix, >100% skip, and deduplication", () => {
    const raw = [
      "Here are the extracted holdings:",
      "```json",
      JSON.stringify([
        {
          symbol: "ASELS.E",
          isin: "TRAASELS91H2",
          name: "ASELSAN",
          weight: "5,25%",
          type: "stock",
          market_value: "228.500.000,50",
        },
        {
          symbol: "ASELS",
          isin: "TRAASELS91H2",
          name: "ASELSAN DUPLICATE",
          weight: 5.25,
          type: "stock",
        },
        {
          symbol: "THYAO",
          name: "THY",
          weight: 8.1,
          type: "stock",
          market_value: 300000000,
        },
        {
          symbol: "BADWEIGHT",
          name: "Bad",
          weight: 250, // >100 skipped
          type: "stock",
        },
      ]),
      "```",
    ].join("\n");

    const holdings = provider._parseLlmResponseText(raw);
    expect(holdings).toHaveLength(2);
    expect(holdings[0]).toMatchObject({
      symbol: "ASELS",
      isin: "TRAASELS91H2",
      weight: 5.25,
      market_value: 228500000.5,
    });
    expect(holdings[1]).toMatchObject({
      symbol: "THYAO",
      weight: 8.1,
    });

    expect(() => provider._parseLlmResponseText("no array here")).toThrow(
      APIError,
    );
    expect(() => provider._parseLlmResponseText("[invalid json")).toThrow(
      APIError,
    );
  });

  test("getHoldings & getHoldingsTable full pipeline with period matching, caching, and Fund.getHoldings", async () => {
    jest
      .spyOn(provider, "getFundId")
      .mockResolvedValue("33E5FED7E50300EAE0530A4A622B2AEA");

    const client = (provider as unknown as { client: { get: jest.Mock } })
      .client;
    jest
      .spyOn(client, "get")
      // 1. getDisclosures
      .mockResolvedValueOnce({
        data: [
          {
            disclosureBasic: {
              disclosureId: "d2",
              disclosureIndex: 2002,
              year: 2025,
              donem: 12,
              attachmentCount: 1,
            },
          },
          {
            disclosureBasic: {
              disclosureId: "d1",
              disclosureIndex: 2001,
              year: 2025,
              donem: 11,
              attachmentCount: 1,
            },
          },
        ],
      })
      // 2. _getFileId for disclosure 2001
      .mockResolvedValueOnce({
        data: '<a href="/tr/api/file/download/0123456789abcdef0123456789abcdef">PDF</a>',
      })
      // 3. _downloadPdf
      .mockResolvedValueOnce({
        data: Buffer.from("hdr%PDF-1.7\ncontent"),
      });

    const postSpy = jest.spyOn(axios, "post").mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: {
              content:
                '[{"symbol":"GARAN","name":"Garanti","weight":3.5,"type":"stock","market_value":100},{"symbol":"THYAO","name":"THY","weight":7.2,"type":"stock","market_value":200}]',
            },
          },
        ],
      },
    });

    const table = await provider.getHoldingsTable(
      "YAY",
      "sk-or-v1-test",
      "2025-11",
    );
    expect(table).toHaveLength(2);
    // Sorted descending by weight
    expect(table[0].symbol).toBe("THYAO");
    expect(table[0].weight).toBe(7.2);
    expect(table[1].symbol).toBe("GARAN");
    expect(postSpy).toHaveBeenCalledTimes(1);

    // Cached second call doesn't re-invoke OpenRouter
    const cached = await provider.getHoldings("YAY", "sk-or-v1-test", "2025-11");
    expect(cached).toHaveLength(2);
    expect(postSpy).toHaveBeenCalledTimes(1);

    // Fund.getHoldings delegates to singleton
    const singletonSpy = jest
      .spyOn(getKAPHoldingsProvider(), "getHoldings")
      .mockResolvedValueOnce(cached);
    const fundHoldings = await new Fund("YAY").getHoldings(
      "sk-or-v1-test",
      "2025-11",
    );
    expect(fundHoldings).toHaveLength(2);
    expect(singletonSpy).toHaveBeenCalledWith("YAY", "sk-or-v1-test", "2025-11");
  });

  test("getDisclosures throws DataNotAvailableError when fund not found in KAP", async () => {
    jest.spyOn(provider, "getFundId").mockResolvedValue(null);
    await expect(provider.getDisclosures("MISSING")).rejects.toThrow(
      DataNotAvailableError,
    );
  });
});
