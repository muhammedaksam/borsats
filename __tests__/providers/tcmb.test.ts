import { getTCMBProvider } from "@/providers/tcmb";

import { resilientTest } from "../helpers/network-utils";

describe("TCMBProvider", () => {
  const provider = getTCMBProvider();

  jest.setTimeout(30000);

  describe("calculateInflation", () => {
    it(
      "should calculate inflation between two dates",
      resilientTest(async () => {
        // Calculate from Jan 2023 to Jan 2024
        const result = await provider.calculateInflation(2023, 1, 2024, 1, 100);

        expect(result).toBeDefined();
        expect(result.startDate).toBe("2023-01");
        expect(result.endDate).toBe("2024-01");
        expect(result.initialValue).toBe(100);
        expect(result.finalValue).toBeGreaterThan(100);
        expect(result.totalChange).toBeGreaterThan(0);
      }),
    );

    it("should throw error for invalid dates", async () => {
      await expect(
        provider.calculateInflation(2024, 1, 2023, 1),
      ).rejects.toThrow();
    });
  });

  describe("getData", () => {
    it(
      "should fetch TÜFE data",
      resilientTest(async () => {
        const data = await provider.getData("tufe", 5);

        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThan(0);
        expect(data[0].yearlyInflation).toBeDefined();
        expect(data[0].date).toBeInstanceOf(Date);
      }),
    );

    it(
      "should fetch ÜFE data",
      resilientTest(async () => {
        const data = await provider.getData("ufe", 5);

        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThan(0);
      }),
    );
  });

  describe("getLatest", () => {
    it(
      "should get latest TÜFE",
      resilientTest(async () => {
        const latest = await provider.getLatest("tufe");

        expect(latest).toBeDefined();
        expect(latest.yearlyInflation).toBeGreaterThan(0);
      }),
    );
  });

  describe("Interest Rates", () => {
    it(
      "should fetch policy rate",
      resilientTest(async () => {
        const rate = await provider.getPolicyRate();

        expect(rate).toBeDefined();
        if (rate.date) {
          expect(rate.date).toBeInstanceOf(Date);
          expect(typeof rate.lending).toBe("number");
          expect(rate.lending).toBeGreaterThan(0);
        }
      }),
      15000,
    );

    it(
      "should fetch overnight rates",
      resilientTest(async () => {
        const rate = await provider.getOvernightRates();

        expect(rate).toBeDefined();
        if (rate.date) {
          expect(rate.date).toBeInstanceOf(Date);
          if (rate.borrowing) expect(typeof rate.borrowing).toBe("number");
          if (rate.lending) expect(typeof rate.lending).toBe("number");
        }
      }),
      15000,
    );

    it(
      "should fetch all rates",
      resilientTest(async () => {
        const rates = await provider.getAllRates();

        expect(Array.isArray(rates)).toBe(true);
        expect(rates.length).toBe(3);

        const rateTypes = rates.map((r) => r.rateType);
        expect(rateTypes).toContain("policy");
        expect(rateTypes).toContain("overnight");
        expect(rateTypes).toContain("late_liquidity");
      }),
      20000,
    );

    it(
      "should fetch rate history",
      resilientTest(async () => {
        const history = await provider.getRateHistory("policy");

        expect(Array.isArray(history)).toBe(true);
        if (history.length > 0) {
          expect(history[0].date).toBeInstanceOf(Date);
        }
      }),
      15000,
    );
  });
});
