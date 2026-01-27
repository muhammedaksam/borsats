import { getBTCTurkProvider } from "@/providers/btcturk";

import { resilientTest } from "../helpers/network-utils";

describe("BTCTurkProvider", () => {
  let provider: ReturnType<typeof getBTCTurkProvider>;

  beforeAll(() => {
    provider = getBTCTurkProvider();
  });

  describe("getPairs", () => {
    it(
      "should fetch all trading pairs",
      resilientTest(async () => {
        const pairs = await provider.getPairs();

        expect(pairs).toBeInstanceOf(Array);
        expect(pairs.length).toBeGreaterThan(0);
        expect(pairs).toContain("BTCTRY");
        expect(pairs).toContain("ETHTRY");
      }),
      15000,
    );

    it(
      "should filter pairs by quote currency",
      resilientTest(async () => {
        const tryPairs = await provider.getPairs("TRY");

        expect(tryPairs).toBeInstanceOf(Array);
        expect(tryPairs.length).toBeGreaterThan(0);

        // All pairs should end with TRY
        tryPairs.forEach((pair: string) => {
          expect(pair).toMatch(/TRY$/);
        });
      }),
      15000,
    );

    it(
      "should return USDT pairs when filtering by USDT",
      resilientTest(async () => {
        const usdtPairs = await provider.getPairs("USDT");

        expect(usdtPairs).toBeInstanceOf(Array);
        if (usdtPairs.length > 0) {
          usdtPairs.forEach((pair: string) => {
            expect(pair).toMatch(/USDT$/);
          });
        }
      }),
      15000,
    );
  });

  describe("getTicker", () => {
    it(
      "should fetch current ticker for BTCTRY",
      resilientTest(async () => {
        const ticker = await provider.getTicker("BTCTRY");

        expect(ticker).toHaveProperty("symbol");
        expect(ticker).toHaveProperty("last");
        expect(ticker).toHaveProperty("updateTime");
        expect(ticker.symbol).toBe("BTCTRY");
        expect(typeof ticker.last).toBe("number");
        expect(ticker.last).toBeGreaterThan(0);

        // Optional fields that may be present
        if (ticker.change !== undefined) {
          expect(typeof ticker.change).toBe("number");
        }
        if (ticker.changePercent !== undefined) {
          expect(typeof ticker.changePercent).toBe("number");
        }
        if (ticker.volume !== undefined) {
          expect(typeof ticker.volume).toBe("number");
        }
        if (ticker.high !== undefined) {
          expect(typeof ticker.high).toBe("number");
        }
        if (ticker.low !== undefined) {
          expect(typeof ticker.low).toBe("number");
        }
      }),
      15000,
    );

    it(
      "should fetch current ticker for ETHTRY",
      resilientTest(async () => {
        const ticker = await provider.getTicker("ETHTRY");

        expect(ticker).toHaveProperty("symbol");
        expect(ticker).toHaveProperty("last");
        expect(ticker.symbol).toBe("ETHTRY");
        expect(typeof ticker.last).toBe("number");
        expect(ticker.last).toBeGreaterThan(0);
      }),
      15000,
    );

    it("should throw error for invalid pair", async () => {
      await expect(provider.getTicker("INVALIDPAIR")).rejects.toThrow();
    });
  });

  describe("getHistory", () => {
    it(
      "should fetch historical data for BTCTRY with 1d interval",
      resilientTest(async () => {
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

        const history = await provider.getHistory({
          pair: "BTCTRY",
          interval: "1d",
          start: startDate,
          end: endDate,
        });

        expect(history).toBeInstanceOf(Array);
        expect(history.length).toBeGreaterThan(0);

        // Check structure of first item
        const firstItem = history[0];
        expect(firstItem).toHaveProperty("date");
        expect(firstItem).toHaveProperty("open");
        expect(firstItem).toHaveProperty("high");
        expect(firstItem).toHaveProperty("low");
        expect(firstItem).toHaveProperty("close");
        expect(firstItem).toHaveProperty("volume");
        expect(typeof firstItem.open).toBe("number");
        expect(typeof firstItem.high).toBe("number");
        expect(typeof firstItem.low).toBe("number");
        expect(typeof firstItem.close).toBe("number");
        expect(typeof firstItem.volume).toBe("number");
      }),
      15000,
    );

    it(
      "should fetch historical data for ETHTRY with 1h interval",
      resilientTest(async () => {
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000); // 1 day ago

        const history = await provider.getHistory({
          pair: "ETHTRY",
          interval: "1h",
          start: startDate,
          end: endDate,
        });

        expect(history).toBeInstanceOf(Array);
        expect(history.length).toBeGreaterThan(0);
      }),
      15000,
    );

    it(
      "should handle different interval formats",
      resilientTest(async () => {
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days ago

        const history4h = await provider.getHistory({
          pair: "BTCTRY",
          interval: "4h",
          start: startDate,
          end: endDate,
        });

        expect(history4h).toBeInstanceOf(Array);
      }),
      15000,
    );

    it("should throw error for invalid pair", async () => {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);

      await expect(
        provider.getHistory({
          pair: "INVALIDPAIR",
          interval: "1d",
          start: startDate,
          end: endDate,
        }),
      ).rejects.toThrow();
    });
  });
});
