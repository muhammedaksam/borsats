import { getCanliDovizProvider } from "~/providers/canlidoviz";
import { resilientTest } from "../../helpers/network-utils";

describe("CanliDovizProvider (Integration)", () => {
  let provider: ReturnType<typeof getCanliDovizProvider>;

  beforeAll(() => {
    provider = getCanliDovizProvider();
    provider.clearCache();
  });

  describe("getHistory Branches", () => {
    it(
      "should fetch historical data for USD from Merkez Bankası",
      resilientTest(async () => {
        const history = await provider.getHistory({
          asset: "USD",
          institution: "merkez-bankasi",
        });
        expect(history.length).toBeGreaterThan(0);
      }),
      15000,
    );

    it(
      "should fetch historical data for gram-altin",
      resilientTest(async () => {
        const history = await provider.getHistory({
          asset: "gram-altin",
        });
        expect(history.length).toBeGreaterThan(0);
      }),
      15000,
    );

    it(
      "should fetch historical data for BRENT petrol",
      resilientTest(async () => {
        const history = await provider.getHistory({
          asset: "BRENT",
        });
        expect(history.length).toBeGreaterThan(0);
      }),
      15000,
    );

    it(
      "should fetch historical data for XAG-USD (Ons Gümüş)",
      resilientTest(async () => {
        const history = await provider.getHistory({
          asset: "XAG-USD",
        });
        expect(history.length).toBeGreaterThan(0);
      }),
      15000,
    );
  });

  describe("getCurrentRate", () => {
    it(
      "should fetch current rate for USD",
      resilientTest(async () => {
        const current = await provider.getCurrentRate("USD");
        expect(current.symbol).toBe("USD/TRY");
        expect(current.last).toBeGreaterThan(0);
      }),
      15000,
    );
  });

  describe("getBankRates", () => {
    it(
      "should fetch bank rates for USD",
      resilientTest(async () => {
        const rates = await provider.getBankRates("USD");
        expect(Array.isArray(rates)).toBe(true);
      }),
      30000,
    );

    it(
      "should fetch rate for a specific bank",
      resilientTest(async () => {
        const rate = await provider.getBankRates("USD", "akbank");
        expect(rate).toBeDefined();
      }),
    );

    it(
      "should throw error if bank not found for currency",
      resilientTest(async () => {
        await expect(
          provider.getBankRates("CAD", "nonexistent"),
        ).rejects.toThrow();
      }),
    );
  });
});
