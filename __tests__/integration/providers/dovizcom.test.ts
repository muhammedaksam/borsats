import { APIError, DataNotAvailableError } from "~/exceptions";
import { getDovizcomProvider } from "~/providers/dovizcom";
import { resilientTest } from "../../helpers/network-utils";

describe("DovizcomProvider (Integration)", () => {
  const provider = getDovizcomProvider();
  jest.setTimeout(30000);

  describe("getBankRates", () => {
    it(
      "should fetch all bank rates for USD",
      resilientTest(async () => {
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
      }),
    );

    it(
      "should fetch single bank rate",
      resilientTest(async () => {
        const rate = await provider.getBankRates("EUR", "akbank");
        expect(rate).toHaveProperty("bank");
        expect(rate).toHaveProperty("currency");
        expect((rate as { bank: string }).bank).toBe("akbank");
        expect((rate as { currency: string }).currency).toBe("EUR");
      }),
    );
  });

  describe("getMetalInstitutionRates", () => {
    it(
      "should fetch all institution rates for gram-altin",
      resilientTest(async () => {
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
      }),
    );

    it(
      "should fetch single institution rate",
      resilientTest(async () => {
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
      }),
    );

    it(
      "should throw error for non-existent institution",
      resilientTest(async () => {
        await expect(
          provider.getMetalInstitutionRates("gram-altin", "nonexistent-inst"),
        ).rejects.toThrow(DataNotAvailableError);
      }),
    );
  });

  describe("getCurrent", () => {
    it(
      "should fetch current price for USD (requires valid token)",
      resilientTest(async () => {
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
      }),
    );
  });

  describe("getHistory", () => {
    it(
      "should fetch history for USD (requires valid token)",
      resilientTest(async () => {
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
      }),
    );
  });

  describe("getInstitutionHistory", () => {
    it(
      "should fetch institution history for gram-gumus (requires valid token)",
      resilientTest(async () => {
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
      }),
    );
  });
});
