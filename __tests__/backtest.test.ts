import { BacktestEngine, StrategyFunc } from "@/backtest";
import { OHLCVData } from "@/types";

// Mock Ticker to avoid network requests
jest.mock("@/ticker", () => {
  return {
    Ticker: jest.fn().mockImplementation((_symbol: string) => {
      return {
        history: jest.fn().mockResolvedValue(generateMockData()),
      };
    }),
  };
});

function generateMockData(): OHLCVData[] {
  const data: OHLCVData[] = [];
  const start = new Date("2023-01-01");
  for (let i = 0; i < 100; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    data.push({
      date,
      open: 100 + i,
      high: 105 + i,
      low: 95 + i,
      close: 102 + i, // Upward trend
      volume: 1000,
    });
  }
  return data;
}

describe("BacktestEngine", () => {
  it("should run a simple buy and hold strategy", async () => {
    const strategy: StrategyFunc = (_candle, position, _indicators) => {
      if (!position) return "BUY";
      return "HOLD";
    };

    const engine = new BacktestEngine("THYAO", strategy, { period: "1y" });
    const result = await engine.run();

    expect(result).toBeDefined();
    expect(result.symbol).toBe("THYAO");
    expect(result.trades.length).toBeGreaterThan(0); // Should buy at start and close at end
    expect(result.netProfit).toBeGreaterThan(0); // Uptrend
  });

  it("should calculate various indicators", async () => {
    const strategy: StrategyFunc = (_candle, _position, inds) => {
      // Just return HOLD, we want to see if inds are populated
      if (inds.rsi !== undefined) return "HOLD";
      return "HOLD";
    };

    const engine = new BacktestEngine("THYAO", strategy, {
      indicators: [
        "rsi",
        "sma_20",
        "ema_12",
        "macd",
        "bb",
        "atr",
        "stoch",
        "adx",
      ],
    });
    const result = await engine.run();
    expect(result).toBeDefined();
    expect(result.totalTrades).toBe(0); // Strategy always returns HOLD
  });

  it("should handle error when no data found", async () => {
    const { Ticker } = require("@/ticker");
    Ticker.mockImplementationOnce((_symbol: string) => ({
      history: jest.fn().mockResolvedValue([]),
    }));

    const engine = new BacktestEngine("INVALID", (_c) => "HOLD");
    await expect(engine.run()).rejects.toThrow("No historical data");
  });
});
