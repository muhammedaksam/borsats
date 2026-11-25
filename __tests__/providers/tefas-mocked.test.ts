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

    test("fetches fund detail via v2 API with camelCase mapping and profile", async () => {
      let callCount = 0;
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockImplementation((url: string) => {
          callCount++;
          if (url.includes("fonBilgiGetir")) {
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
          if (url.includes("fonProfilBilgiGetir")) {
            return Promise.resolve({
              status: 200,
              headers: { "content-type": "application/json" },
              data: {
                resultList: [
                  {
                    fonKodu: "ABC",
                    fonUnvan: "ABC Fonu",
                    isinKodu: "TRMAF1WWWWW4",
                    sonIsSaat: "17:30",
                    basIsSaat: "09:00",
                    minAlis: 1,
                    minSatis: 1,
                    fonGeriAlisValor: 1,
                    fonSatisValor: 2,
                    kapLink: "https://www.kap.org.tr/tr/fon-bilgileri/genel/abc",
                    tefasDurum: "TEFAS'ta işlem görüyor",
                    riskDegeri: "7",
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

      expect(callCount).toBe(3);
      expect(detail.fund_code).toBe("ABC");
      expect(detail.name).toBe("ABC Fonu");
      expect(detail.price).toBe(12.5);
      expect(detail.fund_size).toBe(5000000);
      expect(detail.investor_count).toBe(300);
      expect(detail.category).toBe("Hisse");
      expect(detail.fund_type).toBe("Hisse Senedi");
      expect(detail.fund_class).toBe("YAT");
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
      // Restored from fonProfilBilgiGetir (v0.9.0+)
      expect(detail.isin).toBe("TRMAF1WWWWW4");
      expect(detail.last_trading_time).toBe("17:30");
      expect(detail.first_trading_time).toBe("09:00");
      expect(detail.buy_valor).toBe(1);
      expect(detail.sell_valor).toBe(2);
      expect(detail.kap_link).toBe(
        "https://www.kap.org.tr/tr/fon-bilgileri/genel/abc",
      );
      expect(detail.tefas_status).toBe("TEFAS'ta işlem görüyor");
      // v2-unavailable fields
      expect(detail.date).toBeUndefined();
      expect(detail.founder).toBeUndefined();
      expect(detail.manager).toBeUndefined();
      expect(detail.weekly_return).toBeUndefined();
      expect(detail.allocation).toBeUndefined();
    });

    test("falls back to EMK when fund not found in YAT returns list", async () => {
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest
          .fn()
          .mockImplementation((url: string, body: Record<string, unknown>) => {
            if (url.includes("fonBilgiGetir")) {
              return Promise.resolve({
                status: 200,
                headers: { "content-type": "application/json" },
                data: {
                  resultList: [{ fonKodu: "AAJ", fonUnvan: "EMK Fonu", sonFiyat: 5 }],
                },
              });
            }
            if (url.includes("fonGetiriBazliBilgiGetir")) {
              if (body.fonTipi === "YAT") {
                return Promise.resolve({
                  status: 200,
                  headers: { "content-type": "application/json" },
                  data: { resultList: [{ fonKodu: "OTHER" }] },
                });
              }
              return Promise.resolve({
                status: 200,
                headers: { "content-type": "application/json" },
                data: {
                  resultList: [
                    { fonKodu: "AAJ", fonTurAciklama: "Emeklilik", getiri1y: 32.5 },
                  ],
                },
              });
            }
            return Promise.resolve({
              status: 200,
              headers: { "content-type": "application/json" },
              data: { resultList: [] },
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
      const detail = await provider.getFundDetail("AAJ", "YAT");
      expect(detail.fund_class).toBe("EMK");
      expect(detail.return_1y).toBe(32.5);
    });

    test("returns cached result on second call", async () => {
      let callCount = 0;
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockImplementation((url: string) => {
          callCount++;
          if (url.includes("fonBilgiGetir")) {
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
          if (url.includes("fonProfilBilgiGetir")) {
            return Promise.resolve({
              status: 200,
              headers: { "content-type": "application/json" },
              data: { resultList: [{ fonKodu: "TST", isinKodu: "TR000" }] },
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
      expect(callCount).toBe(3);
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
  // TEFAS v2 History (fonFiyatBilgiGetir) & Allocation (dagilimSiraliGetirT)
  // =========================================================================

  describe("_resolvePeriyod & getHistory (v2 fonFiyatBilgiGetir)", () => {
    afterEach(() => jest.restoreAllMocks());

    const V2_HISTORY_ROWS = [
      { fonKodu: "AAK", fonUnvan: "AK PORTFOY", tarih: "2026-04-01", fiyat: 35.1 },
      { fonKodu: "AAK", fonUnvan: "AK PORTFOY", tarih: "2026-04-15", fiyat: 35.3 },
      { fonKodu: "AAK", fonUnvan: "AK PORTFOY", tarih: "2026-04-30", fiyat: 35.21 },
    ];

    test("maps period strings to TEFAS v2 periyod codes", () => {
      const provider = createProvider();
      const expected: Array<[string, number]> = [
        ["1d", 13],
        ["5d", 13],
        ["1mo", 1],
        ["3mo", 3],
        ["6mo", 6],
        ["ytd", 0],
        ["1y", 12],
        ["3y", 36],
        ["5y", 60],
        ["max", 60],
        ["unknown", 1],
      ];
      for (const [label, code] of expected) {
        expect(provider._resolvePeriyod(label)).toBe(code);
      }
    });

    test("fetches history via fonFiyatBilgiGetir with periyod enum and caches by periyod", async () => {
      const postMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: { "content-type": "application/json" },
        data: { resultList: V2_HISTORY_ROWS },
      });
      jest.spyOn(axios, "create").mockReturnValue({
        post: postMock,
        get: jest.fn(),
        defaults: { headers: { common: {} } },
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      } as unknown as ReturnType<typeof axios.create>);

      const provider = createProvider();
      const hist = await provider.getHistory({ fundCode: "aak", period: "3y" });
      expect(hist.length).toBe(3);
      expect(hist[0].price).toBe(35.1);
      expect(Number.isNaN(hist[0].fundSize)).toBe(true);
      expect(hist[0].investors).toBe(0);
      expect(postMock).toHaveBeenCalledTimes(1);
      expect(postMock.mock.calls[0][0]).toContain("fonFiyatBilgiGetir");
      expect(postMock.mock.calls[0][1]).toEqual({
        fonKodu: "AAK",
        dil: "TR",
        periyod: 36,
      });

      // Second call hits periyod cache
      await provider.getHistory({ fundCode: "AAK", period: "3y" });
      expect(postMock).toHaveBeenCalledTimes(1);
    });

    test("filters history client-side for explicit start/end dates", async () => {
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockResolvedValue({
          status: 200,
          headers: { "content-type": "application/json" },
          data: { resultList: V2_HISTORY_ROWS },
        }),
        get: jest.fn(),
        defaults: { headers: { common: {} } },
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      } as unknown as ReturnType<typeof axios.create>);

      const provider = createProvider();
      const hist = await provider.getHistory({
        fundCode: "AAK",
        start: new Date("2026-04-10"),
        end: new Date("2026-04-20"),
      });
      expect(hist.length).toBe(1);
      expect(hist[0].price).toBe(35.3);
    });

    test("throws DataNotAvailableError when empty or filtered to empty", async () => {
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
      await expect(
        provider.getHistory({ fundCode: "ZZZ", period: "1mo" }),
      ).rejects.toThrow("No history for fund");
    });

    test("wraps non-APIError in APIError", async () => {
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockRejectedValue(new TypeError("boom")),
        get: jest.fn(),
        defaults: { headers: { common: {} } },
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      } as unknown as ReturnType<typeof axios.create>);

      const provider = createProvider();
      await expect(
        provider.getHistory({ fundCode: "TST", period: "1mo" }),
      ).rejects.toThrow("Failed to fetch history for TST");
    });
  });

  // =========================================================================
  // getAllocation & getAllocationHistory (v2 dagilimSiraliGetirT, v0.11.0+)
  // =========================================================================

  describe("getAllocation & getAllocationHistory (v2 dagilimSiraliGetirT)", () => {
    afterEach(() => jest.restoreAllMocks());

    const TPC_ROW = {
      fonKodu: "TPC",
      fonUnvan: "TEB PORTFÖY KIYMETLİ MADENLER FON SEPETİ FONU",
      tarih: "2026-08-07",
      bb: 0,
      byf: 15.86,
      d: 0,
      hs: 1.45,
      tpp: 3.27,
      vmtl: 1.69,
      ybyf: 47.33,
      yyf: 30.4,
      bilFiyat: "1786114823099",
    };

    test("parses weights, drops zero/meta, attaches code & verified labels, sorts by magnitude", async () => {
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockResolvedValue({
          status: 200,
          headers: { "content-type": "application/json" },
          data: { resultList: [TPC_ROW] },
        }),
        get: jest.fn(),
        defaults: { headers: { common: {} } },
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      } as unknown as ReturnType<typeof axios.create>);

      const provider = createProvider();
      const alloc = await provider.getAllocation("TPC");

      expect(alloc.map((a) => a.code)).toEqual([
        "ybyf",
        "yyf",
        "byf",
        "tpp",
        "vmtl",
        "hs",
      ]);
      expect(alloc[0].asset_type).toBe("Yabancı Borsa Yatırım Fonları");
      expect(alloc[0].asset_name).toBe("Foreign ETFs");
      expect(alloc.find((a) => a.code === "tpp")?.asset_type).toBe(
        "Takasbank Para Piyasası",
      );
      expect(alloc.find((a) => a.code === "bilFiyat")).toBeUndefined();
    });

    test("preserves negative weights (e.g. leveraged repo leg) and null labels for unverified codes", async () => {
      const row = {
        fonKodu: "ABG",
        tarih: "2026-08-07",
        hs: 114.14,
        r: -14.14,
        gas: 4.95,
      };
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockResolvedValue({
          status: 200,
          headers: { "content-type": "application/json" },
          data: { resultList: [row] },
        }),
        get: jest.fn(),
        defaults: { headers: { common: {} } },
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      } as unknown as ReturnType<typeof axios.create>);

      const provider = createProvider();
      const alloc = await provider.getAllocation("ABG");
      expect(alloc[0].code).toBe("hs");
      expect(alloc[1].code).toBe("r");
      expect(alloc[1].weight).toBe(-14.14);
      const gas = alloc.find((a) => a.code === "gas");
      expect(gas?.asset_type).toBeNull();
      expect(gas?.asset_name).toBeNull();
    });

    test("snapshot keeps only newest date and probes YAT -> EMK on Index 0 out of bounds", async () => {
      const seenTypes: string[] = [];
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest
          .fn()
          .mockImplementation((_url: string, body: Record<string, unknown>) => {
            seenTypes.push(String(body.fonTipi));
            if (body.fonTipi === "YAT") {
              return Promise.resolve({
                status: 200,
                headers: { "content-type": "application/json" },
                data: {
                  errorMessage: "Index 0 out of bounds for length 0",
                  resultList: null,
                },
              });
            }
            return Promise.resolve({
              status: 200,
              headers: { "content-type": "application/json" },
              data: {
                resultList: [
                  { ...TPC_ROW, tarih: "2026-08-05", hs: 9.0 },
                  TPC_ROW,
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
      const alloc = await provider.getAllocation("AAJ");
      expect(seenTypes).toEqual(["YAT", "EMK"]);
      const uniqueDates = new Set(alloc.map((a) => a.date.toISOString().slice(0, 10)));
      expect(Array.from(uniqueDates)).toEqual(["2026-08-07"]);
    });

    test("splits multi-month range into <=28-day windows without gaps or overlap", async () => {
      const seenWindows: Array<[string, string]> = [];
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest
          .fn()
          .mockImplementation((_url: string, body: Record<string, unknown>) => {
            seenWindows.push([String(body.basTarih), String(body.bitTarih)]);
            return Promise.resolve({
              status: 200,
              headers: { "content-type": "application/json" },
              data: {
                resultList: [
                  {
                    ...TPC_ROW,
                    tarih: `2026-0${seenWindows.length + 4}-01`,
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
      const alloc = await provider.getAllocation(
        "TPC",
        new Date("2026-05-01T00:00:00Z"),
        new Date("2026-07-30T00:00:00Z"),
        "YAT",
      );
      expect(seenWindows.length).toBe(4);
      expect(seenWindows[0][0]).toBe("20260501");
      expect(seenWindows[seenWindows.length - 1][1]).toBe("20260730");
      expect(alloc.length).toBeGreaterThan(0);
    });

    test("throws DataNotAvailableError when fund not in any universe", async () => {
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
      await expect(provider.getAllocation("ZZZZ")).rejects.toThrow("ZZZZ");
    });

    test("getAllocationHistory supports 1w/1mo/2mo/3mo and rejects >91 days or unknown period", async () => {
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockResolvedValue({
          status: 200,
          headers: { "content-type": "application/json" },
          data: { resultList: [TPC_ROW] },
        }),
        get: jest.fn(),
        defaults: { headers: { common: {} } },
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      } as unknown as ReturnType<typeof axios.create>);

      const provider = createProvider();
      for (const period of ["1w", "1mo", "2mo", "3mo"]) {
        const res = await provider.getAllocationHistory({
          fundCode: "TPC",
          period,
          fundType: "YAT",
        });
        expect(res.length).toBeGreaterThan(0);
      }

      await expect(
        provider.getAllocationHistory({ fundCode: "TPC", period: "1y" }),
      ).rejects.toThrow("period must be one of");

      await expect(
        provider.getAllocationHistory({
          fundCode: "TPC",
          start: new Date("2025-01-01"),
          end: new Date("2025-06-01"),
        }),
      ).rejects.toThrow("at most ~3 months");
    });
  });

  // =========================================================================
  // screenFunds — individual filter branches
  // =========================================================================

  describe("screenFunds individual filters", () => {
    afterEach(() => jest.restoreAllMocks());

    const fundsData = {
      status: 200,
      headers: { "content-type": "application/json" },
      data: {
        resultList: [
          {
            fonKodu: "A",
            fonUnvan: "A",
            fonTurAciklama: "X",
            getiri1a: 5,
            getiri3a: 10,
            getiri6a: 20,
            getiriyb: 25,
            getiri1y: 30,
            getiri3y: 60,
            getiri5y: 100,
          },
          {
            fonKodu: "B",
            fonUnvan: "B",
            fonTurAciklama: "Y",
            // all returns undefined
          },
        ],
      },
    };

    function mockCreate() {
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockResolvedValue(fundsData),
        get: jest.fn(),
        defaults: { headers: { common: {} } },
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      } as unknown as ReturnType<typeof axios.create>);
    }

    test("filters by minReturn1m", async () => {
      mockCreate();
      const r = await createProvider().screenFunds({ minReturn1m: 3 });
      expect(r.length).toBe(1);
      expect(r[0].fund_code).toBe("A");
    });

    test("filters by minReturn3m", async () => {
      mockCreate();
      const r = await createProvider().screenFunds({ minReturn3m: 8 });
      expect(r.length).toBe(1);
      expect(r[0].fund_code).toBe("A");
    });

    test("filters by minReturn6m", async () => {
      mockCreate();
      const r = await createProvider().screenFunds({ minReturn6m: 15 });
      expect(r.length).toBe(1);
    });

    test("filters by minReturnYtd", async () => {
      mockCreate();
      const r = await createProvider().screenFunds({ minReturnYtd: 20 });
      expect(r.length).toBe(1);
    });

    test("filters by minReturn3y alone", async () => {
      mockCreate();
      const r = await createProvider().screenFunds({ minReturn3y: 50 });
      expect(r.length).toBe(1);
    });

    test("filters by minReturn5y alone", async () => {
      mockCreate();
      const r = await createProvider().screenFunds({ minReturn5y: 90 });
      expect(r.length).toBe(1);
    });

    test("excludes funds with undefined returns", async () => {
      mockCreate();
      const r = await createProvider().screenFunds({ minReturn1m: 0 });
      // Fund B has undefined getiri1a, so it gets excluded
      expect(r.length).toBe(1);
    });
  });

  // =========================================================================
  // getTEFASProvider singleton
  // =========================================================================

  describe("getTEFASProvider singleton", () => {
    test("returns same instance on multiple calls", async () => {
      const { getTEFASProvider } = await import("~/providers/tefas");
      const a = getTEFASProvider();
      const b = getTEFASProvider();
      expect(a).toBe(b);
    });
  });
});
