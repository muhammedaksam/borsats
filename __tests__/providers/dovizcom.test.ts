import { APIError, DataNotAvailableError } from "@/exceptions";
import { DovizcomProvider, getDovizcomProvider } from "@/providers/dovizcom";

describe("DovizcomProvider", () => {
  const provider = getDovizcomProvider();

  jest.setTimeout(30000);

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
      // Token is set internally - we can verify it works by checking no error
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

  describe("getBankRates", () => {
    it("should fetch all bank rates for USD", async () => {
      const rates = await provider.getBankRates("USD");

      expect(Array.isArray(rates)).toBe(true);
      if (Array.isArray(rates) && rates.length > 0) {
        const rate = rates[0];
        expect(rate).toHaveProperty("bank");
        expect(rate).toHaveProperty("currency");
        expect(rate).toHaveProperty("buy");
        expect(rate).toHaveProperty("sell");
        expect(rate.currency).toBe("USD");
        expect(typeof rate.buy).toBe("number");
        expect(typeof rate.sell).toBe("number");
      }
    });

    it("should fetch single bank rate", async () => {
      const rate = await provider.getBankRates("EUR", "akbank");

      expect(rate).toHaveProperty("bank");
      expect(rate).toHaveProperty("currency");
      expect((rate as { bank: string }).bank).toBe("akbank");
      expect((rate as { currency: string }).currency).toBe("EUR");
    });

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

  describe("getMetalInstitutionRates", () => {
    it("should fetch all institution rates for gram-altin", async () => {
      const rates = await provider.getMetalInstitutionRates("gram-altin");

      expect(Array.isArray(rates)).toBe(true);
      if (Array.isArray(rates) && rates.length > 0) {
        const rate = rates[0];
        expect(rate).toHaveProperty("institution");
        expect(rate).toHaveProperty("asset");
        expect(rate).toHaveProperty("buy");
        expect(rate).toHaveProperty("sell");
        expect(rate.asset).toBe("gram-altin");
      }
    });

    it("should fetch single institution rate", async () => {
      const rates = await provider.getMetalInstitutionRates("gram-altin");
      if (Array.isArray(rates) && rates.length > 0) {
        const firstInst = rates[0].institution;
        const rate = await provider.getMetalInstitutionRates(
          "gram-altin",
          firstInst,
        );

        expect(rate).toHaveProperty("institution");
        expect((rate as { institution: string }).institution).toBe(firstInst);
      }
    });

    it("should throw error for unsupported asset", async () => {
      await expect(
        provider.getMetalInstitutionRates("unsupported-asset"),
      ).rejects.toThrow(DataNotAvailableError);
    });

    it("should throw error for non-existent institution", async () => {
      await expect(
        provider.getMetalInstitutionRates("gram-altin", "nonexistent-inst"),
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

  describe("getCurrent", () => {
    it("should fetch current price for USD (requires valid token)", async () => {
      // Note: This test requires valid Bearer token which may be unreliable
      // For currencies/metals, use canlidoviz provider instead
      try {
        const data = await provider.getCurrent("USD");

        expect(data).toHaveProperty("symbol");
        expect(data).toHaveProperty("last");
        expect(data).toHaveProperty("open");
        expect(data.symbol).toBe("USD");
        expect(typeof data.last).toBe("number");
      } catch (e) {
        if (e instanceof APIError) {
          expect(e).toBeInstanceOf(APIError);
        } else {
          throw e;
        }
      }
    });

    it("should throw error for unsupported asset", async () => {
      await expect(provider.getCurrent("UNSUPPORTED_ASSET")).rejects.toThrow(
        DataNotAvailableError,
      );
    });
  });

  describe("getHistory", () => {
    it("should fetch history for USD (requires valid token)", async () => {
      // Note: This test requires valid Bearer token which may be unreliable
      // For currencies/metals, use canlidoviz provider instead
      try {
        const data = await provider.getHistory({
          asset: "USD",
          period: "5d",
        });

        expect(Array.isArray(data)).toBe(true);
        if (data.length > 0) {
          const item = data[0];
          expect(item).toHaveProperty("date");
          expect(item).toHaveProperty("close");
          expect(item.date).toBeInstanceOf(Date);
        }
      } catch (e) {
        if (e instanceof APIError) {
          expect(e).toBeInstanceOf(APIError);
        } else {
          throw e;
        }
      }
    });

    it("should throw error for unsupported asset", async () => {
      await expect(
        provider.getHistory({ asset: "UNSUPPORTED_ASSET" }),
      ).rejects.toThrow(DataNotAvailableError);
    });
  });

  describe("getInstitutionHistory", () => {
    it("should fetch institution history for gram-gumus (requires valid token)", async () => {
      // Note: This test requires valid Bearer token which may be unreliable
      try {
        const data = await provider.getInstitutionHistory({
          asset: "gram-gumus",
          institution: "akbank",
          period: "5d",
        });

        expect(Array.isArray(data)).toBe(true);
        if (data.length > 0) {
          const item = data[0];
          expect(item).toHaveProperty("date");
          expect(item).toHaveProperty("close");
        }
      } catch (e) {
        if (e instanceof APIError) {
          expect(e).toBeInstanceOf(APIError);
        } else {
          throw e;
        }
      }
    });

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
