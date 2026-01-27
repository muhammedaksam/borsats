import { getCanliDovizProvider } from "@/providers/canlidoviz";

describe("CanliDovizProvider", () => {
  let provider: ReturnType<typeof getCanliDovizProvider>;

  beforeAll(() => {
    provider = getCanliDovizProvider();
    provider.clearCache();
  });

  describe("getSupportedCurrencies", () => {
    it("should return list of supported currencies", () => {
      const currencies = provider.getSupportedCurrencies();
      expect(Array.isArray(currencies)).toBe(true);
      expect(currencies).toContain("USD");
    });
  });

  describe("getHistory Branches", () => {
    it("should fetch historical data for USD from Merkez Bankası", async () => {
      const history = await provider.getHistory({
        asset: "USD",
        institution: "merkez-bankasi",
      });
      expect(history.length).toBeGreaterThan(0);
    }, 15000);

    it("should fetch historical data for gram-altin", async () => {
      const history = await provider.getHistory({
        asset: "gram-altin",
      });
      expect(history.length).toBeGreaterThan(0);
    }, 15000);

    it("should fetch historical data for BRENT petrol", async () => {
      const history = await provider.getHistory({
        asset: "BRENT",
      });
      expect(history.length).toBeGreaterThan(0);
    }, 15000);

    it("should fetch historical data for XAG-USD (Ons Gümüş)", async () => {
      const history = await provider.getHistory({
        asset: "XAG-USD",
      });
      expect(history.length).toBeGreaterThan(0);
    }, 15000);

    it("should throw for unsupported asset + institution", async () => {
      await expect(
        provider.getHistory({
          asset: "BTC",
          institution: "akbank",
        }),
      ).rejects.toThrow();
    });
  });

  describe("getCurrentRate", () => {
    it("should fetch current rate for USD", async () => {
      const current = await provider.getCurrentRate("USD");
      expect(current.symbol).toBe("USD/TRY");
      expect(current.last).toBeGreaterThan(0);
    }, 15000);

    it("should handle error for missing data", async () => {
      await expect(
        provider.getCurrentRate("INVALID_ASSET_XYZ"),
      ).rejects.toThrow();
    });
  });

  describe("getBankRates", () => {
    it("should fetch bank rates for USD", async () => {
      try {
        const rates = await provider.getBankRates("USD");
        expect(Array.isArray(rates)).toBe(true);
      } catch (e) {
        console.warn("External API skip:", e);
      }
    }, 30000);

    it("should throw for unsupported bank rate currency", async () => {
      await expect(provider.getBankRates("BTC")).rejects.toThrow();
    });

    it("should fetch rate for a specific bank", async () => {
      try {
        const rate = await provider.getBankRates("USD", "akbank");
        expect(rate).toBeDefined();
      } catch (e) {
        console.warn("External API skip:", e);
      }
    });

    it("should throw error if bank not found for currency", async () => {
      await expect(
        provider.getBankRates("CAD", "nonexistent"),
      ).rejects.toThrow();
    });
  });

  describe("getSupportedBanks", () => {
    it("should return banks for various currencies", () => {
      expect(provider.getSupportedBanks("USD").length).toBeGreaterThan(0);
      expect(provider.getSupportedBanks("EUR").length).toBeGreaterThan(0);
      expect(provider.getSupportedBanks("GBP").length).toBeGreaterThan(0);
      expect(provider.getSupportedBanks("CHF").length).toBeGreaterThan(0);
      expect(provider.getSupportedBanks("CAD").length).toBeGreaterThan(0);
      expect(provider.getSupportedBanks("AUD").length).toBeGreaterThan(0);
      expect(provider.getSupportedBanks("JPY").length).toBeGreaterThan(0);
      expect(provider.getSupportedBanks("RUB").length).toBeGreaterThan(0);
      expect(provider.getSupportedBanks("SAR").length).toBeGreaterThan(0);
      expect(provider.getSupportedBanks("AED").length).toBeGreaterThan(0);
      expect(provider.getSupportedBanks("CNY").length).toBeGreaterThan(0);
      expect(provider.getSupportedBanks("INVALID").length).toBe(0);
    });
  });

  describe("getSupportedMetals", () => {
    it("should return list of supported metals", () => {
      const metals = provider.getSupportedMetals();
      expect(metals).toContain("gram-altin");
    });
  });

  describe("InstitutionRates", () => {
    it("should return empty array for now", async () => {
      const rates = await provider.getInstitutionRates("gram-altin");
      expect(rates).toEqual([]);
    });
  });
});
