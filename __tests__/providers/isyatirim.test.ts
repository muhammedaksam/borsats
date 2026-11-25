import { getIsYatirimProvider } from "~/providers/isyatirim";
import { resilientTest } from "../helpers/network-utils";

describe("IsYatirimProvider", () => {
  const provider = getIsYatirimProvider();

  // Increase timeout for network requests
  jest.setTimeout(60000);

  beforeEach(() => {
    provider.clearCache();
  });

  describe("getRealtimeQuote", () => {
    it(
      "should fetch real-time quote for THYAO",
      resilientTest(async () => {
        const quote = await provider.getRealtimeQuote("THYAO");
        expect(quote.symbol).toBe("THYAO");
        expect(quote.last).toBeGreaterThan(0);
      }),
    );

    it(
      "should hit the cache on second call",
      resilientTest(async () => {
        await provider.getRealtimeQuote("THYAO");
        const quote = await provider.getRealtimeQuote("THYAO");
        expect(quote.symbol).toBe("THYAO");
      }),
    );

    it("should throw error for invalid symbol", async () => {
      await expect(
        provider.getRealtimeQuote("INVALID_SYMBOL_XYZ_123"),
      ).rejects.toThrow();
    });
  });

  describe("getIndexHistory Variations", () => {
    it(
      "should fetch history for XU100",
      resilientTest(async () => {
        const end = new Date();
        const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
        const history = await provider.getIndexHistory("XU100", start, end);
        expect(Array.isArray(history)).toBe(true);
      }),
    );

    it(
      "should fetch history for XU030",
      resilientTest(async () => {
        const end = new Date();
        const start = new Date(end.getTime() - 3 * 24 * 60 * 60 * 1000);
        const history = await provider.getIndexHistory("XU030", start, end);
        expect(Array.isArray(history)).toBe(true);
      }),
    );
  });

  describe("getDividends and Capital", () => {
    it(
      "should fetch dividends for FROTO",
      resilientTest(async () => {
        const dividends = await provider.getDividends("FROTO");
        expect(Array.isArray(dividends)).toBe(true);
      }),
    );

    it(
      "should fetch capital increases for SISE",
      resilientTest(async () => {
        const splits = await provider.getCapitalIncreases("SISE");
        expect(Array.isArray(splits)).toBe(true);
      }),
    );
  });

  describe("getFinancialStatements Comprehensive", () => {
    it(
      "should fetch balance sheet for THYAO (Annual)",
      resilientTest(async () => {
        const financials = await provider.getFinancialStatements(
          "THYAO",
          "balance_sheet",
          false,
        );
        expect(financials.length).toBeGreaterThan(0);
      }),
    );

    it(
      "should fetch income statement for THYAO (Quarterly)",
      resilientTest(async () => {
        const financials = await provider.getFinancialStatements(
          "THYAO",
          "income_stmt",
          true,
        );
        expect(financials.length).toBeGreaterThan(0);
      }),
    );

    it(
      "should fetch cashflow for THYAO",
      resilientTest(async () => {
        const financials = await provider.getFinancialStatements(
          "THYAO",
          "cashflow",
          false,
        );
        expect(financials.length).toBeGreaterThan(0);
      }),
    );
  });

  describe("Metrics and Summary", () => {
    it(
      "should fetch metrics for various stocks",
      resilientTest(async () => {
        await provider.getCompanyMetrics("THYAO");
        await provider.getCompanyMetrics("ISCTR");
        await provider.getCompanyMetrics("EREGL");
        expect(true).toBe(true);
      }),
    );

    it(
      "should fetch business summary for various stocks",
      resilientTest(async () => {
        expect(await provider.getBusinessSummary("THYAO")).toBeTruthy();
        expect(await provider.getBusinessSummary("SISE")).toBeTruthy();
      }),
    );
  });

  describe("getMajorHolders", () => {
    it(
      "should fetch major holders for various stocks",
      resilientTest(async () => {
        const h1 = await provider.getMajorHolders("THYAO");
        const h2 = await provider.getMajorHolders("GARAN");
        expect(Array.isArray(h1)).toBe(true);
        expect(Array.isArray(h2)).toBe(true);
      }),
    );
  });

  describe("Financial statement itemCode prefix filtering (v0.8.2 parity)", () => {
    it("filters balance_sheet (1xxx+2xxx), income_stmt (3xxx), and cashflow (4xxx)", () => {
      const samplePayload = {
        value: [
          { itemCode: "1A", itemDescTr: "Dönen Varlıklar", value1: 100 },
          { itemCode: "2A", itemDescTr: "Kısa Vadeli Yükümlülükler", value1: 50 },
          { itemCode: "3A", itemDescTr: "Satış Gelirleri", value1: 200 },
          { itemCode: "4A", itemDescTr: "İşletme Faaliyetlerinden Nakit Akışları", value1: 40 },
        ],
      };
      const periods = [{ year: 2024, period: 12 }];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parse = (provider as any)._parseFinancialResponse.bind(provider);

      const bs = parse(samplePayload, periods, false, "balance_sheet");
      expect(bs.map((r: Record<string, unknown>) => r.Item)).toEqual([
        "Dönen Varlıklar",
        "Kısa Vadeli Yükümlülükler",
      ]);

      const is = parse(samplePayload, periods, false, "income_stmt");
      expect(is.map((r: Record<string, unknown>) => r.Item)).toEqual([
        "Satış Gelirleri",
      ]);

      const cf = parse(samplePayload, periods, false, "cashflow");
      expect(cf.map((r: Record<string, unknown>) => r.Item)).toEqual([
        "İşletme Faaliyetlerinden Nakit Akışları",
      ]);
    });
  });
});
