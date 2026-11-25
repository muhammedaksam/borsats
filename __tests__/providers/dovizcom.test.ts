import { DataNotAvailableError } from "~/exceptions";
import { DovizcomProvider, getDovizcomProvider } from "~/providers/dovizcom";

describe("DovizcomProvider", () => {
  const provider = getDovizcomProvider();

  describe("constructor", () => {
    it("should create provider with default settings", () => {
      const p = new DovizcomProvider();
      expect(p).toBeInstanceOf(DovizcomProvider);
    });

    it("should create provider with custom token", () => {
      const p = new DovizcomProvider({ token: "custom_token_123" });
      expect(p).toBeInstanceOf(DovizcomProvider);
    });
  });

  describe("setToken", () => {
    it("should set custom bearer token", () => {
      const p = new DovizcomProvider();
      p.setToken("new_custom_token_456");
      expect(p).toBeInstanceOf(DovizcomProvider);
    });
  });

  describe("getBanks", () => {
    it("should return list of supported banks", () => {
      const banks = provider.getBanks();
      expect(Array.isArray(banks)).toBe(true);
      expect(banks.length).toBeGreaterThan(0);
      expect(banks).toContain("akbank");
      expect(banks).toContain("garanti");
      expect(banks).toContain("isbank");
    });
  });

  describe("getBankRates validation", () => {
    it("should throw error for unsupported currency", async () => {
      await expect(provider.getBankRates("XYZ")).rejects.toThrow(
        DataNotAvailableError,
      );
    });

    it("should throw error for unknown bank", async () => {
      await expect(provider.getBankRates("USD", "unknownbank")).rejects.toThrow(
        DataNotAvailableError,
      );
    });
  });

  describe("getMetalInstitutions", () => {
    it("should return list of supported metal assets", () => {
      const metals = provider.getMetalInstitutions();
      expect(Array.isArray(metals)).toBe(true);
      expect(metals.length).toBeGreaterThan(0);
      expect(metals).toContain("gram-altin");
      expect(metals).toContain("gram-gumus");
    });
  });

  describe("getMetalInstitutionRates validation", () => {
    it("should throw error for unsupported asset", async () => {
      await expect(
        provider.getMetalInstitutionRates("unsupported-asset"),
      ).rejects.toThrow(DataNotAvailableError);
    });
  });

  describe("getHistoryInstitutions", () => {
    it("should return list of institutions with history support", () => {
      const institutions = provider.getHistoryInstitutions();
      expect(Array.isArray(institutions)).toBe(true);
      expect(institutions.length).toBeGreaterThan(0);
      expect(institutions).toContain("akbank");
      expect(institutions).toContain("isbankasi");
    });
  });

  describe("getCurrent validation", () => {
    it("should throw error for unsupported asset", async () => {
      await expect(provider.getCurrent("UNSUPPORTED_ASSET")).rejects.toThrow(
        DataNotAvailableError,
      );
    });
  });

  describe("getHistory validation", () => {
    it("should throw error for unsupported asset", async () => {
      await expect(
        provider.getHistory({ asset: "UNSUPPORTED_ASSET" }),
      ).rejects.toThrow(DataNotAvailableError);
    });
  });

  describe("getInstitutionHistory validation", () => {
    it("should throw error for unsupported institution", async () => {
      await expect(
        provider.getInstitutionHistory({
          asset: "gram-gumus",
          institution: "nonexistent-bank",
        }),
      ).rejects.toThrow(DataNotAvailableError);
    });

    it("should throw error for unsupported asset", async () => {
      await expect(
        provider.getInstitutionHistory({
          asset: "unsupported-asset" as "gram-altin",
          institution: "akbank",
        }),
      ).rejects.toThrow(DataNotAvailableError);
    });
  });

  describe("getDovizcomProvider singleton", () => {
    it("should return same instance on multiple calls", () => {
      const p1 = getDovizcomProvider();
      const p2 = getDovizcomProvider();
      expect(p1).toBe(p2);
    });
  });
});
