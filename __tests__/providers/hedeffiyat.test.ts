import { getHedefFiyatProvider } from "@/providers/hedeffiyat";

// Mock BaseProvider
jest.mock("@/providers/base", () => {
  return {
    BaseProvider: class BaseProvider {
      public client = {
        get: jest.fn(),
      };
      public cache = {
        get: jest.fn(),
        set: jest.fn(),
        has: jest.fn(),
      };
      constructor(_opts: unknown) {}
    },
  };
});

describe("HedefFiyatProvider", () => {
  const provider = getHedefFiyatProvider(); // This will use the mocked BaseProvider

  // Helper to access the mocked client
  const getMockClient = () => {
    return (
      provider as unknown as {
        client: { get: jest.Mock };
      }
    ).client;
  };

  jest.setTimeout(20000);

  const mockTargetHtml = `
      <div>
          Güncel Fiyat: <strong class="text-primary">100,50 ₺</strong>
          En Yüksek Tahmin</div> <div>150,00 ₺</div>
          En Düşük Tahmin</div> <div>90,00 ₺</div>
          Ortalama Fiyat Tahmini</div> <div>120,00 ₺</div>
          Kurum Sayısı: <strong>15</strong>
      </div>
      value="/senet/thyao-turk-hava-yollari"
  `;

  const mockRecHtml = `
       value="/senet/thyao-turk-hava-yollari"
       <a class="btn btn-sm btn-success">Güçlü Al</a>
       <a class="btn btn-sm btn-primary">Al</a>
       <a class="btn btn-sm btn-warning">Tut</a>
       <a class="btn btn-sm btn-danger">Sat</a>
       <a class="btn btn-sm btn-danger">Güçlü Sat</a>
  `;

  beforeEach(() => {
    jest.clearAllMocks();
    const client = getMockClient();

    // Default implementation returns empty
    client.get.mockResolvedValue({ data: "" });
  });

  describe("getPriceTargets", () => {
    it("should fetch price targets for THYAO", async () => {
      const client = getMockClient();
      client.get.mockImplementation((url: string) => {
        if (
          url.includes("senetler") ||
          url.includes("THYAO") ||
          url.includes("thyao")
        ) {
          return Promise.resolve({ data: mockTargetHtml });
        }
        return Promise.resolve({ data: "" });
      });

      const targets = await provider.getPriceTargets("THYAO");

      expect(targets).toBeDefined();
      expect(targets).toHaveProperty("current");
      expect(targets).toHaveProperty("low");
      expect(targets).toHaveProperty("high");
      expect(targets).toHaveProperty("mean");
      expect(targets).toHaveProperty("numberOfAnalysts");

      // Verify specific values from mock
      expect(targets.current).toBe(100.5);
      expect(targets.low).toBe(90.0);
      expect(targets.high).toBe(150.0);
      expect(targets.mean).toBe(120.0);
      expect(targets.numberOfAnalysts).toBe(15);
    });

    it("should return empty data for non-existent symbol", async () => {
      const targets = await provider.getPriceTargets("NONEXISTENT123");

      expect(targets).toBeDefined();
      // Expect nulls or defaults for empty data
      expect(targets.numberOfAnalysts).toBeNull();
    });
  });

  describe("getRecommendationsSummary", () => {
    it("should fetch recommendations for THYAO", async () => {
      const client = getMockClient();
      client.get.mockImplementation((url: string) => {
        // Assuming getRecommendationsSummary fetches a page
        if (
          url.includes("senetler") ||
          url.includes("THYAO") ||
          url.includes("thyao")
        ) {
          return Promise.resolve({ data: mockRecHtml });
        }
        return Promise.resolve({ data: "" });
      });

      const recommendations = await provider.getRecommendationsSummary("THYAO");

      expect(recommendations).toBeDefined();
      expect(recommendations.strongBuy).toBe(1);
      expect(recommendations.buy).toBe(1);
      expect(recommendations.hold).toBe(1);
      expect(recommendations.sell).toBe(1);
      expect(recommendations.strongSell).toBe(1);
    });

    it("should return zero counts for non-existent symbol", async () => {
      const recommendations =
        await provider.getRecommendationsSummary("NONEXISTENT123");

      expect(recommendations).toBeDefined();
      const total = Object.values(recommendations).reduce((a, b) => a + b, 0);
      expect(total).toBe(0);
    });
  });
});
