// Mocked tests for crypto.ts coverage (lines 23, 65-100)

jest.mock("~/providers/btcturk", () => ({
  getBTCTurkProvider: () => ({
    getTicker: jest.fn().mockResolvedValue({ last: 50000, symbol: "BTCTRY" }),
    getHistory: jest.fn().mockResolvedValue([
      { date: new Date(), open: 49000, high: 51000, low: 48000, close: 50000, volume: 100 },
    ]),
    getPairs: jest.fn().mockResolvedValue(["BTCTRY", "ETHTRY"]),
  }),
}));

jest.mock("~/providers/tradingview-scanner", () => ({
  getScannerProvider: () => ({
    getTASignals: jest.fn().mockImplementation((_sym: string, _scr: string, interval: string) => {
      if (interval === "1m") throw new Error("Not available");
      return Promise.resolve({
        summary: { recommendation: "BUY", buy: 10, sell: 2, neutral: 5 },
        oscillators: { recommendation: "BUY" },
        moving_averages: { recommendation: "BUY" },
      });
    }),
  }),
  TASignals: {},
}));

import { Crypto, cryptoList } from "~/crypto";

describe("Crypto Coverage", () => {
  test("pair and symbol getters", () => {
    const c = new Crypto("btctry");
    expect(c.pair).toBe("BTCTRY");
    expect(c.symbol).toBe("BTCTRY");
  });

  test("current returns cached data on second call", async () => {
    const c = new Crypto("btctry");
    const d1 = await c.current;
    expect(d1.last).toBe(50000);
    const d2 = await c.current;
    expect(d2).toEqual(d1);
  });

  test("history with options", async () => {
    const c = new Crypto("btctry");
    const h = await c.history({ interval: "1d", start: "2024-01-01", end: "2024-01-31" });
    expect(Array.isArray(h)).toBe(true);
  });

  test("history with defaults", async () => {
    const c = new Crypto("ethtry");
    const h = await c.history();
    expect(Array.isArray(h)).toBe(true);
  });

  test("technicals returns TechnicalAnalyzer", async () => {
    const c = new Crypto("btctry");
    const ta = await c.technicals("1d");
    expect(ta).toBeDefined();
  });

  test("taSignals returns signals", async () => {
    const c = new Crypto("btctry");
    const s = await c.taSignals("1d");
    expect(s.summary.recommendation).toBe("BUY");
  });

  test("taSignalsAllTimeframes handles errors", async () => {
    const c = new Crypto("btctry");
    const all = await c.taSignalsAllTimeframes();
    expect(all["1d"]).toHaveProperty("summary");
    expect(all["1m"]).toHaveProperty("error");
  });

  test("cryptoList returns pairs", async () => {
    const pairs = await cryptoList();
    expect(pairs).toContain("BTCTRY");
  });
});
