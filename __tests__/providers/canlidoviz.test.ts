import { getCanliDovizProvider } from "~/providers/canlidoviz";

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

  describe("getHistory validation", () => {
    it("should throw for unsupported asset + institution", async () => {
      await expect(
        provider.getHistory({
          asset: "BTC",
          institution: "akbank",
        }),
      ).rejects.toThrow();
    });
  });

  describe("getCurrentRate validation", () => {
    it("should handle error for missing data", async () => {
      await expect(
        provider.getCurrentRate("INVALID_ASSET_XYZ"),
      ).rejects.toThrow();
    });
  });

  describe("getBankRates validation", () => {
    it("should throw for unsupported bank rate currency", async () => {
      await expect(provider.getBankRates("BTC")).rejects.toThrow();
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
