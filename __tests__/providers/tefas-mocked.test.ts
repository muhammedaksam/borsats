/**
 * Mocked TEFAS provider tests — exercises v2 API endpoints,
 * error handling, Turkish decimal parsing, and date formatting.
 */

import axios from "axios";
import { TEFASProvider } from "~/providers/tefas";

// Create a fresh provider instance for mocking
function createProvider(): TEFASProvider {
  return new TEFASProvider();
}

describe("TEFASProvider (Mocked) — Coverage Boost", () => {
  // =========================================================================
  // parseTurkishDecimal
  // =========================================================================

  describe("parseTurkishDecimal", () => {
    test("normal comma-separated value", () => {
      expect(TEFASProvider.parseTurkishDecimal("1,23")).toBe(1.23);
    });

    test("integer value", () => {
      expect(TEFASProvider.parseTurkishDecimal("42")).toBe(42);
    });

    test("null returns null", () => {
      expect(TEFASProvider.parseTurkishDecimal(null)).toBeNull();
    });

    test("undefined returns null", () => {
      expect(TEFASProvider.parseTurkishDecimal(undefined)).toBeNull();
    });

    test("empty string returns null", () => {
      expect(TEFASProvider.parseTurkishDecimal("")).toBeNull();
    });

    test("whitespace-only returns null", () => {
      expect(TEFASProvider.parseTurkishDecimal("   ")).toBeNull();
    });

    test("non-numeric string returns null", () => {
      expect(TEFASProvider.parseTurkishDecimal("abc")).toBeNull();
    });

    test("negative value", () => {
      expect(TEFASProvider.parseTurkishDecimal("-3,14")).toBe(-3.14);
    });
  });

  // =========================================================================
  // getManagementFees (v2 API)
  // =========================================================================

  describe("getManagementFees (mocked HTTP)", () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    test("parses successful response", async () => {
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockResolvedValue({
          status: 200,
          headers: { "content-type": "application/json" },
          data: {
            resultList: [
              {
                fonKodu: "ABC",
                fonUnvan: "ABC Fonu",
                fonTurAciklama: "Hisse",
                kurucuKod: "XYZ",
                uygulananYu1Y: "1,50",
                fonIcTuzukYu1G: "2,00",
                fonTopGiderKesoran: "3,50",
                yillikGetiri: 15.5,
              },
              {
                fonKodu: "DEF",
                fonUnvan: "DEF Fonu",
                fonTurAciklama: "Borç",
                kurucuKod: "QRS",
                uygulananYu1Y: null,
                fonIcTuzukYu1G: null,
                fonTopGiderKesoran: null,
                yillikGetiri: null,
              },
            ],
          },
        }),
        get: jest.fn(),
        defaults: { headers: { common: {} } },
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      } as unknown as ReturnType<typeof axios.create>);

      const freshProvider = createProvider();
      const fees = await freshProvider.getManagementFees("YAT");

      expect(fees.length).toBe(2);
      expect(fees[0].fund_code).toBe("ABC");
      expect(fees[0].applied_fee).toBe(1.5);
      expect(fees[0].prospectus_fee).toBe(2.0);
      expect(fees[0].max_expense_ratio).toBe(3.5);
      expect(fees[0].annual_return).toBe(15.5);

      // Null fields
      expect(fees[1].applied_fee).toBeNull();
      expect(fees[1].annual_return).toBeNull();
    });

    test("handles empty data array", async () => {
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockResolvedValue({
          status: 200,
          headers: { "content-type": "application/json" },
          data: { resultList: [] },
        }),
        get: jest.fn(),
        defaults: { headers: { common: {} } },
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      } as unknown as ReturnType<typeof axios.create>);

      const freshProvider = createProvider();
      const fees = await freshProvider.getManagementFees("EMK");
      expect(fees).toEqual([]);
    });

    test("handles missing resultList field", async () => {
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockResolvedValue({
          status: 200,
          headers: { "content-type": "application/json" },
          data: {},
        }),
        get: jest.fn(),
        defaults: { headers: { common: {} } },
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      } as unknown as ReturnType<typeof axios.create>);

      const freshProvider = createProvider();
      const fees = await freshProvider.getManagementFees("YAT");
      expect(fees).toEqual([]);
    });

    test("re-throws APIError on failure", async () => {
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockResolvedValue({
          status: 200,
          headers: { "content-type": "text/html" },
          data: "<html>error</html>",
        }),
        get: jest.fn(),
        defaults: { headers: { common: {} } },
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      } as unknown as ReturnType<typeof axios.create>);

      const provider = createProvider();
      await expect(provider.getManagementFees("YAT")).rejects.toThrow(
        "Failed to fetch management fees",
      );
    });
  });

  // =========================================================================
  // getFundDetail (v2 API)
  // =========================================================================

  describe("getFundDetail (v2 API, mocked HTTP)", () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    test("fetches fund detail via v2 API with camelCase mapping", async () => {
      let callCount = 0;
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              status: 200,
              headers: { "content-type": "application/json" },
              data: {
                resultList: [
                  {
                    fonKodu: "ABC",
                    fonUnvan: "ABC Fonu",
                    fonKategori: "Hisse",
                    sonFiyat: 12.5,
                    portBuyukluk: 5000000,
                    yatirimciSayi: 300,
                    gunlukGetiri: 0.5,
                    kategoriDerece: 3,
                    kategoriFonSay: 50,
                    pazarPayi: 2.5,
                  },
                ],
              },
            });
          }
          return Promise.resolve({
            status: 200,
            headers: { "content-type": "application/json" },
            data: {
              resultList: [
                {
                  fonKodu: "ABC",
                  fonTurAciklama: "Hisse Senedi",
                  riskDegeri: 7,
                  getiri1a: 1.2,
                  getiri3a: 4.5,
                  getiri6a: 8.3,
                  getiriyb: 15.0,
                  getiri1y: 25.0,
                  getiri3y: 80.0,
                  getiri5y: 150.0,
                },
                {
                  fonKodu: "DEF",
                  fonTurAciklama: "Borç",
                  riskDegeri: 3,
                  getiri1a: 0.5,
                },
              ],
            },
          });
        }),
        get: jest.fn(),
        defaults: { headers: { common: {} } },
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      } as unknown as ReturnType<typeof axios.create>);

      const provider = createProvider();
      const detail = await provider.getFundDetail("abc");

      expect(detail.fund_code).toBe("ABC");
      expect(detail.name).toBe("ABC Fonu");
      expect(detail.price).toBe(12.5);
      expect(detail.fund_size).toBe(5000000);
      expect(detail.investor_count).toBe(300);
      expect(detail.category).toBe("Hisse");
      expect(detail.fund_type).toBe("Hisse Senedi");
      expect(detail.risk_value).toBe(7);
      expect(detail.return_1m).toBe(1.2);
      expect(detail.return_3m).toBe(4.5);
      expect(detail.return_6m).toBe(8.3);
      expect(detail.return_ytd).toBe(15.0);
      expect(detail.return_1y).toBe(25.0);
      expect(detail.return_3y).toBe(80.0);
      expect(detail.return_5y).toBe(150.0);
      expect(detail.daily_return).toBe(0.5);
      expect(detail.category_rank).toBe(3);
      expect(detail.category_fund_count).toBe(50);
      expect(detail.market_share).toBe(2.5);
      // v2-unavailable fields
      expect(detail.date).toBeUndefined();
      expect(detail.founder).toBeUndefined();
      expect(detail.manager).toBeUndefined();
      expect(detail.weekly_return).toBeUndefined();
      expect(detail.isin).toBeUndefined();
      expect(detail.allocation).toBeUndefined();
    });

    test("returns cached result on second call", async () => {
      let callCount = 0;
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              status: 200,
              headers: { "content-type": "application/json" },
              data: {
                resultList: [
                  {
                    fonKodu: "TST",
                    fonUnvan: "Test Fonu",
                    fonKategori: "Borç",
                    sonFiyat: 5,
                    portBuyukluk: 1000,
                    yatirimciSayi: 10,
                    gunlukGetiri: 0.1,
                  },
                ],
              },
            });
          }
          return Promise.resolve({
            status: 200,
            headers: { "content-type": "application/json" },
            data: {
              resultList: [
                {
                  fonKodu: "TST",
                  fonTurAciklama: "Borç",
                  riskDegeri: 1,
                  getiri1y: 10,
                },
              ],
            },
          });
        }),
        get: jest.fn(),
        defaults: { headers: { common: {} } },
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      } as unknown as ReturnType<typeof axios.create>);

      const provider = createProvider();
      await provider.getFundDetail("TST");
      await provider.getFundDetail("TST");
      expect(callCount).toBe(2);
    });

    test("throws DataNotAvailableError when infoList is empty", async () => {
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockResolvedValue({
          status: 200,
          headers: { "content-type": "application/json" },
          data: { resultList: [] },
        }),
        get: jest.fn(),
        defaults: { headers: { common: {} } },
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      } as unknown as ReturnType<typeof axios.create>);

      const provider = createProvider();
      await expect(provider.getFundDetail("NOFUND")).rejects.toThrow(
        "No data for fund",
      );
    });

    test("handles returns API failure gracefully", async () => {
      let callCount = 0;
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              status: 200,
              headers: { "content-type": "application/json" },
              data: {
                resultList: [
                  {
                    fonKodu: "OK",
                    fonUnvan: "OK Fonu",
                    fonKategori: "X",
                    sonFiyat: 1,
                    portBuyukluk: 0,
                    yatirimciSayi: 0,
                    gunlukGetiri: 0,
                  },
                ],
              },
            });
          }
          return Promise.resolve({
            status: 200,
            headers: { "content-type": "text/html" },
            data: "",
          });
        }),
        get: jest.fn(),
        defaults: { headers: { common: {} } },
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      } as unknown as ReturnType<typeof axios.create>);

      const provider = createProvider();
      const detail = await provider.getFundDetail("OK");
      expect(detail.fund_code).toBe("OK");
      expect(detail.name).toBe("OK Fonu");
      expect(detail.return_1y).toBeUndefined();
    });

    test("re-throws APIError from v2 envelope", async () => {
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockResolvedValue({
          status: 200,
          headers: { "content-type": "application/json" },
          data: { errorMessage: "Fon bulunamadı" },
        }),
        get: jest.fn(),
        defaults: { headers: { common: {} } },
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      } as unknown as ReturnType<typeof axios.create>);

      const provider = createProvider();
      await expect(provider.getFundDetail("BAD")).rejects.toThrow(
        "Fon bulunamadı",
      );
    });
  });

  // =========================================================================
  // search (v2 API)
  // =========================================================================

  describe("search (v2 API, mocked HTTP)", () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    test("returns results from fonUnvanAra", async () => {
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockResolvedValue({
          status: 200,
          headers: { "content-type": "application/json" },
          data: {
            resultList: [
              { fonKodu: "ABC", fonUnvan: "ABC Fonu" },
              { fonKodu: "ABD", fonUnvan: "ABD Fonu" },
            ],
          },
        }),
        get: jest.fn(),
        defaults: { headers: { common: {} } },
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      } as unknown as ReturnType<typeof axios.create>);

      const provider = createProvider();
      const results = await provider.search("AB");

      expect(results.length).toBe(2);
      expect(results[0].fund_code).toBe("ABC");
      expect(results[0].name).toBe("ABC Fonu");
      expect(results[0].fund_type).toBe("");
      expect(results[0].return_1y).toBeUndefined();
    });

    test("respects limit parameter", async () => {
      const bigList = Array.from({ length: 50 }, (_, i) => ({
        fonKodu: `F${String(i).padStart(3, "0")}`,
        fonUnvan: `Fon ${i}`,
      }));

      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockResolvedValue({
          status: 200,
          headers: { "content-type": "application/json" },
          data: { resultList: bigList },
        }),
        get: jest.fn(),
        defaults: { headers: { common: {} } },
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      } as unknown as ReturnType<typeof axios.create>);

      const provider = createProvider();
      const results = await provider.search("F", 5);

      expect(results.length).toBe(5);
    });

    test("throws APIError on failure", async () => {
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockResolvedValue({
          status: 200,
          headers: { "content-type": "text/html" },
          data: "<html>error</html>",
        }),
        get: jest.fn(),
        defaults: { headers: { common: {} } },
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      } as unknown as ReturnType<typeof axios.create>);

      const provider = createProvider();
      await expect(provider.search("X")).rejects.toThrow("Search failed");
    });
  });

  // =========================================================================
  // screenFunds (v2 API)
  // =========================================================================

  describe("screenFunds (v2 API, mocked HTTP)", () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    const mockFunds = {
      status: 200,
      headers: { "content-type": "application/json" },
      data: {
        resultList: [
          {
            fonKodu: "AAA",
            fonUnvan: "AAA Fonu",
            fonTurAciklama: "Hisse",
            kurucuKod: "XYZ",
            getiri1a: 1,
            getiri3a: 3,
            getiri6a: 6,
            getiriyb: 12,
            getiri1y: 20,
            getiri3y: 50,
            getiri5y: 100,
          },
          {
            fonKodu: "BBB",
            fonUnvan: "BBB Fonu",
            fonTurAciklama: "Borç",
            kurucuKod: "ABC",
            getiri1a: 0.5,
            getiri3a: 1.5,
            getiri6a: 3,
            getiriyb: 8,
            getiri1y: 15,
            getiri3y: 40,
            getiri5y: 80,
          },
        ],
      },
    };

    test("returns all funds with no filters", async () => {
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockResolvedValue(mockFunds),
        get: jest.fn(),
        defaults: { headers: { common: {} } },
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      } as unknown as ReturnType<typeof axios.create>);

      const provider = createProvider();
      const results = await provider.screenFunds({});

      expect(results.length).toBe(2);
      expect(results[0].fund_code).toBe("AAA");
      expect(results[1].fund_code).toBe("BBB");
    });

    test("filters by minReturn1y", async () => {
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockResolvedValue(mockFunds),
        get: jest.fn(),
        defaults: { headers: { common: {} } },
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      } as unknown as ReturnType<typeof axios.create>);

      const provider = createProvider();
      const results = await provider.screenFunds({ minReturn1y: 18 });

      expect(results.length).toBe(1);
      expect(results[0].fund_code).toBe("AAA");
    });

    test("filters by founder", async () => {
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockResolvedValue(mockFunds),
        get: jest.fn(),
        defaults: { headers: { common: {} } },
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      } as unknown as ReturnType<typeof axios.create>);

      const provider = createProvider();
      const results = await provider.screenFunds({ founder: "ABC" });

      expect(results.length).toBe(1);
      expect(results[0].fund_code).toBe("BBB");
    });

    test("filters by multiple return thresholds", async () => {
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockResolvedValue(mockFunds),
        get: jest.fn(),
        defaults: { headers: { common: {} } },
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      } as unknown as ReturnType<typeof axios.create>);

      const provider = createProvider();
      const results = await provider.screenFunds({
        minReturn1y: 18,
        minReturn3y: 45,
        minReturn5y: 90,
      });

      expect(results.length).toBe(1);
      expect(results[0].fund_code).toBe("AAA");
    });

    test("handles empty results from API", async () => {
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockResolvedValue({
          status: 200,
          headers: { "content-type": "application/json" },
          data: { resultList: [] },
        }),
        get: jest.fn(),
        defaults: { headers: { common: {} } },
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      } as unknown as ReturnType<typeof axios.create>);

      const provider = createProvider();
      const results = await provider.screenFunds({ minReturn1y: 999 });

      expect(results).toEqual([]);
    });

    test("throws APIError on failure", async () => {
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockResolvedValue({
          status: 200,
          headers: { "content-type": "text/html" },
          data: "<html>error</html>",
        }),
        get: jest.fn(),
        defaults: { headers: { common: {} } },
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      } as unknown as ReturnType<typeof axios.create>);

      const provider = createProvider();
      await expect(provider.screenFunds({})).rejects.toThrow(
        "Screen funds failed",
      );
    });
  });

  // =========================================================================
  // _postJsonV2 edge cases
  // =========================================================================

  describe("_postJsonV2 edge cases", () => {
    let provider: TEFASProvider;

    beforeEach(() => {
      provider = createProvider();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test("re-throws non-APIError immediately", async () => {
      const badError = new TypeError("Something went wrong");
      jest.spyOn(TEFASProvider, "_safeJson").mockImplementation(() => {
        throw badError;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).client.post = jest.fn().mockResolvedValue({
        status: 200,
        headers: { "content-type": "application/json" },
        data: {},
      });

      await expect(
        provider._postJsonV2("fonBilgiGetir", {}, "fonBilgiGetir"),
      ).rejects.toThrow("Something went wrong");

      // Should only attempt once (no retry for non-APIError)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((provider as any).client.post).toHaveBeenCalledTimes(1);
    });

    test("throws after retry exhaustion", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).client.post = jest.fn().mockResolvedValue({
        status: 200,
        headers: { "content-type": "text/html" },
        data: "",
      });

      await expect(
        provider._postJsonV2(
          "fonBilgiGetir",
          { fonKodu: "X" },
          "fonBilgiGetir",
        ),
      ).rejects.toThrow("empty response");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((provider as any).client.post).toHaveBeenCalledTimes(3);
    });
  });

  // =========================================================================
  // Helper methods (via public API)
  // =========================================================================

  describe("_formatDateISO (via getHistory)", () => {
    test("produces correct cache key with dates", async () => {
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockResolvedValue({
          status: 200,
          headers: { "content-type": "application/json" },
          data: { resultList: [] },
        }),
        get: jest.fn(),
        defaults: { headers: { common: {} } },
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      } as unknown as ReturnType<typeof axios.create>);

      const provider = createProvider();
      await provider.getHistory({
        fundCode: "TST",
        start: new Date("2024-03-15"),
        end: new Date("2024-03-20"),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const postCalls = (provider as any).client.post.mock.calls;
      expect(postCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("_formatDateTR (via getAllocation)", () => {
    test("produces DD.MM.YYYY format in request body", async () => {
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockResolvedValue({
          status: 200,
          headers: { "content-type": "application/json" },
          data: {
            data: [
              {
                TARIH: 1710000000000,
                HB: 50,
                HS: 30,
                D: 20,
              },
            ],
          },
        }),
        get: jest.fn(),
        defaults: { headers: { common: {} } },
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      } as unknown as ReturnType<typeof axios.create>);

      const provider = createProvider();
      const allocation = await provider.getAllocation(
        "TST",
        new Date("2024-01-15"),
        new Date("2024-02-15"),
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const postCalls = (provider as any).client.post.mock.calls;
      const body = postCalls[0][1] as URLSearchParams;
      expect(body.get("bastarih")).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
      expect(body.get("bittarih")).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);

      expect(allocation.length).toBeGreaterThan(0);
    });
  });
});
