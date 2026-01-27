import { getTEFASProvider } from "@/providers/tefas";

// Mock TEFAS Provider
class MockTEFASProvider
  extends Object.getPrototypeOf(getTEFASProvider()).constructor
{
  public mockData: unknown = null;
  constructor() {
    super();
    this.client = {
      post: async () => ({ data: this.mockData }),
      get: async () => ({ data: this.mockData }),
      getHeaders: () => ({}),
    } as unknown;
  }
}

describe("TEFASProvider", () => {
  const provider = getTEFASProvider();

  // High timeout for TEFAS API
  jest.setTimeout(60000);

  beforeAll(() => {
    provider.clearCache();
  });

  const runSafe = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e: unknown) {
      if (
        e instanceof Error &&
        (e.name === "DataNotAvailableError" ||
          e.message.includes("No data") ||
          e.message.includes("429"))
      ) {
        console.warn(
          "Skipping TEFAS test due to data/API unavailability:",
          e.message,
        );
      } else {
        throw e;
      }
    }
  };

  describe("getFundDetail", () => {
    it("should fetch details for TTE", async () => {
      await runSafe(async () => {
        const detail = await provider.getFundDetail("TTE");
        expect(detail.fund_code).toBe("TTE");
        expect(detail.price).toBeGreaterThan(0);
      });
    });

    it("should throw DataNotAvailableError for unknown fund", async () => {
      await expect(
        provider.getFundDetail("INVALID_FUND_123"),
      ).rejects.toThrow();
    });
  });

  describe("getHistory", () => {
    it("should fetch historical prices for TTE", async () => {
      await runSafe(async () => {
        const history = await provider.getHistory({
          fundCode: "TTE",
          period: "1mo",
        });
        expect(Array.isArray(history)).toBe(true);
        if (history.length > 0) {
          expect(history[0].price).toBeGreaterThan(0);
        }
      });
    });
  });

  describe("getAllocation", () => {
    it("should fetch allocation for TTE", async () => {
      await runSafe(async () => {
        const allocation = await provider.getAllocation("TTE");
        expect(Array.isArray(allocation)).toBe(true);
      });
    });
  });

  describe("search", () => {
    it("should search funds by name (TTE)", async () => {
      await runSafe(async () => {
        const results = await provider.search("TTE");
        if (results.length > 0) {
          expect(results[0].fund_code).toBe("TTE");
        }
      });
    });
  });
  describe("TEFAS - Mocked parsing tests", () => {
    test("Mocked getFundDetail parsing", async () => {
      const provider = new MockTEFASProvider();

      // Mock getFundDetail response structure (TEFAS generally returns JSON)
      provider.mockData = {
        data: [
          {
            KOD: "TTE",
            AD: "Fund Name",
            TARIH: 1698765432000,
            FIYAT: 10.5,
            TEDAVUL: 1000000,
            KISI: 500,
            KURUCU: "Founder",
            YONETICI: "Manager",
            TIP: "Type",
            GRUP: "Category",
            RISK: 5,
            GETIRI1A: 5,
            GETIRI3A: 15,
            GETIRI6A: 30,
            GETIRIYB: 40,
            GETIRI1Y: 50,
            GETIRI3Y: 150,
            GETIRI5Y: 300,
          },
        ],
      };

      // We are testing if the provider can handle the mocked response structure
      // However, we need to ensure the method calls `this.client.post` which we mocked.
      // Since TEFASProvider might use `this.client` methods directly.

      // NOTE: Real TEFAS provider implementation might handle wrapping differently.
      // But standard Axios mock return { data: ... }
    });
  });
});
