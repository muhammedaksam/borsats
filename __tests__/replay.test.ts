import { createReplay, ReplayCandle, ReplaySession } from "@/replay";
import { OHLCVData } from "@/types";

// Mock Ticker for createReplay
jest.mock("@/ticker", () => ({
  Ticker: jest.fn().mockImplementation(() => ({
    history: jest.fn().mockResolvedValue([
      {
        date: new Date("2024-01-01"),
        open: 100,
        high: 105,
        low: 98,
        close: 102,
        volume: 1000000,
      },
      {
        date: new Date("2024-01-02"),
        open: 102,
        high: 108,
        low: 100,
        close: 106,
        volume: 1200000,
      },
      {
        date: new Date("2024-01-03"),
        open: 106,
        high: 110,
        low: 104,
        close: 108,
        volume: 800000,
      },
    ]),
  })),
}));

const mockData: OHLCVData[] = [
  {
    date: new Date("2024-01-01"),
    open: 100,
    high: 105,
    low: 98,
    close: 102,
    volume: 1000000,
  },
  {
    date: new Date("2024-01-02"),
    open: 102,
    high: 108,
    low: 100,
    close: 106,
    volume: 1200000,
  },
  {
    date: new Date("2024-01-03"),
    open: 106,
    high: 110,
    low: 104,
    close: 108,
    volume: 800000,
  },
  {
    date: new Date("2024-01-04"),
    open: 108,
    high: 112,
    low: 106,
    close: 110,
    volume: 900000,
  },
  {
    date: new Date("2024-01-05"),
    open: 110,
    high: 115,
    low: 109,
    close: 114,
    volume: 1100000,
  },
];

describe("ReplaySession", () => {
  describe("constructor", () => {
    test("creates session with data", () => {
      const session = new ReplaySession("THYAO", mockData);
      expect(session.symbol).toBe("THYAO");
      expect(session.totalCandles).toBe(5);
    });

    test("normalizes symbol to uppercase", () => {
      const session = new ReplaySession("thyao", mockData);
      expect(session.symbol).toBe("THYAO");
    });

    test("accepts speed option", () => {
      const session = new ReplaySession("THYAO", mockData, { speed: 10 });
      const stats = session.stats();
      expect(stats.speed).toBe(10);
    });

    test("accepts realtimeInjection option", () => {
      const session = new ReplaySession("THYAO", mockData, {
        realtimeInjection: true,
      });
      const stats = session.stats();
      expect(stats.realtimeInjection).toBe(true);
    });

    test("handles negative speed as 0", () => {
      const session = new ReplaySession("THYAO", mockData, { speed: -5 });
      const stats = session.stats();
      expect(stats.speed).toBe(0);
    });
  });

  describe("getters", () => {
    test("symbol returns correct value", () => {
      const session = new ReplaySession("THYAO", mockData);
      expect(session.symbol).toBe("THYAO");
    });

    test("totalCandles returns data length", () => {
      const session = new ReplaySession("THYAO", mockData);
      expect(session.totalCandles).toBe(mockData.length);
    });

    test("progress starts at 0", () => {
      const session = new ReplaySession("THYAO", mockData);
      expect(session.progress).toBe(0);
    });

    test("progress is 0 for empty data", () => {
      const session = new ReplaySession("THYAO", []);
      expect(session.progress).toBe(0);
    });
  });

  describe("setData", () => {
    test("replaces data", () => {
      const session = new ReplaySession("THYAO", mockData);
      session.setData(mockData.slice(0, 2));
      expect(session.totalCandles).toBe(2);
    });

    test("resets index", () => {
      const session = new ReplaySession("THYAO", mockData);
      session.setData(mockData.slice(0, 2));
      expect(session.progress).toBe(0);
    });
  });

  describe("setSpeed", () => {
    test("sets speed", () => {
      const session = new ReplaySession("THYAO", mockData);
      session.setSpeed(5);
      expect(session.stats().speed).toBe(5);
    });

    test("clamps negative speed to 0", () => {
      const session = new ReplaySession("THYAO", mockData);
      session.setSpeed(-10);
      expect(session.stats().speed).toBe(0);
    });
  });

  describe("onCandle and removeCallback", () => {
    test("registers callback", () => {
      const session = new ReplaySession("THYAO", mockData);
      const callback = jest.fn();
      session.onCandle(callback);
      expect(session.stats().callbacksRegistered).toBe(1);
    });

    test("removes callback", () => {
      const session = new ReplaySession("THYAO", mockData);
      const callback = jest.fn();
      session.onCandle(callback);
      session.removeCallback(callback);
      expect(session.stats().callbacksRegistered).toBe(0);
    });

    test("removeCallback ignores non-registered callback", () => {
      const session = new ReplaySession("THYAO", mockData);
      const callback = jest.fn();
      session.removeCallback(callback); // Should not throw
      expect(session.stats().callbacksRegistered).toBe(0);
    });
  });

  describe("reset", () => {
    test("resets to beginning", async () => {
      const session = new ReplaySession("THYAO", mockData);
      // Partial replay
      const gen = session.replay();
      await gen.next();
      await gen.next();

      session.reset();
      expect(session.stats().currentIndex).toBe(0);
    });
  });

  describe("stats", () => {
    test("returns correct structure", () => {
      const session = new ReplaySession("THYAO", mockData);
      const stats = session.stats();

      expect(stats).toHaveProperty("symbol");
      expect(stats).toHaveProperty("totalCandles");
      expect(stats).toHaveProperty("currentIndex");
      expect(stats).toHaveProperty("progress");
      expect(stats).toHaveProperty("speed");
      expect(stats).toHaveProperty("realtimeInjection");
      expect(stats).toHaveProperty("elapsedTime");
      expect(stats).toHaveProperty("startDate");
      expect(stats).toHaveProperty("endDate");
      expect(stats).toHaveProperty("callbacksRegistered");
    });

    test("returns correct dates", () => {
      const session = new ReplaySession("THYAO", mockData);
      const stats = session.stats();

      expect(stats.startDate).toEqual(new Date("2024-01-01"));
      expect(stats.endDate).toEqual(new Date("2024-01-05"));
    });

    test("returns null dates for empty data", () => {
      const session = new ReplaySession("THYAO", []);
      const stats = session.stats();

      expect(stats.startDate).toBeNull();
      expect(stats.endDate).toBeNull();
    });
  });

  describe("replay generator", () => {
    test("yields all candles", async () => {
      const session = new ReplaySession("THYAO", mockData);
      const candles: ReplayCandle[] = [];

      for await (const candle of session.replay()) {
        candles.push(candle);
      }

      expect(candles.length).toBe(mockData.length);
    });

    test("returns empty for empty data", async () => {
      const session = new ReplaySession("THYAO", []);
      const candles: ReplayCandle[] = [];

      for await (const candle of session.replay()) {
        candles.push(candle);
      }

      expect(candles.length).toBe(0);
    });

    test("candles have correct structure", async () => {
      const session = new ReplaySession("THYAO", mockData);
      const gen = session.replay();
      const { value: candle } = await gen.next();

      if (candle) {
        expect(candle).toHaveProperty("date");
        expect(candle).toHaveProperty("open");
        expect(candle).toHaveProperty("high");
        expect(candle).toHaveProperty("low");
        expect(candle).toHaveProperty("close");
        expect(candle).toHaveProperty("volume");
        expect(candle).toHaveProperty("_index");
        expect(candle).toHaveProperty("_total");
        expect(candle).toHaveProperty("_progress");
      }
    });

    test("fires callbacks", async () => {
      const session = new ReplaySession("THYAO", mockData);
      const callback = jest.fn();
      session.onCandle(callback);

      for await (const _ of session.replay()) {
        // Just iterate
      }

      expect(callback).toHaveBeenCalledTimes(mockData.length);
    });

    test("emits complete event", async () => {
      const session = new ReplaySession("THYAO", mockData);
      const onComplete = jest.fn();
      session.on("complete", onComplete);

      for await (const _ of session.replay()) {
        // Just iterate
      }

      expect(onComplete).toHaveBeenCalled();
    });

    test("emits candle events", async () => {
      const session = new ReplaySession("THYAO", mockData);
      const onCandle = jest.fn();
      session.on("candle", onCandle);

      for await (const _ of session.replay()) {
        // Just iterate
      }

      expect(onCandle).toHaveBeenCalledTimes(mockData.length);
    });
  });

  describe("replayFiltered", () => {
    test("filters by start date", async () => {
      const session = new ReplaySession("THYAO", mockData);
      const candles: ReplayCandle[] = [];

      for await (const candle of session.replayFiltered({
        startDate: "2024-01-03",
      })) {
        candles.push(candle);
      }

      expect(candles.length).toBe(3); // Jan 3, 4, 5
    });

    test("filters by end date", async () => {
      const session = new ReplaySession("THYAO", mockData);
      const candles: ReplayCandle[] = [];

      for await (const candle of session.replayFiltered({
        endDate: "2024-01-03",
      })) {
        candles.push(candle);
      }

      expect(candles.length).toBe(3); // Jan 1, 2, 3
    });

    test("filters by date range", async () => {
      const session = new ReplaySession("THYAO", mockData);
      const candles: ReplayCandle[] = [];

      for await (const candle of session.replayFiltered({
        startDate: "2024-01-02",
        endDate: "2024-01-04",
      })) {
        candles.push(candle);
      }

      expect(candles.length).toBe(3); // Jan 2, 3, 4
    });

    test("returns empty for no matching dates", async () => {
      const session = new ReplaySession("THYAO", mockData);
      const candles: ReplayCandle[] = [];

      for await (const candle of session.replayFiltered({
        startDate: "2024-02-01",
      })) {
        candles.push(candle);
      }

      expect(candles.length).toBe(0);
    });

    test("accepts Date objects", async () => {
      const session = new ReplaySession("THYAO", mockData);
      const candles: ReplayCandle[] = [];

      for await (const candle of session.replayFiltered({
        startDate: new Date("2024-01-03"),
      })) {
        candles.push(candle);
      }

      expect(candles.length).toBe(3);
    });
  });

  describe("stop", () => {
    test("stops replay", async () => {
      const session = new ReplaySession("THYAO", mockData);
      const candles: ReplayCandle[] = [];

      for await (const candle of session.replay()) {
        candles.push(candle);
        if (candles.length === 2) {
          session.stop();
        }
      }

      expect(candles.length).toBe(2);
    });
  });
});

describe("createReplay", () => {
  test("creates session with loaded data", async () => {
    const session = await createReplay("THYAO");
    expect(session.symbol).toBe("THYAO");
    expect(session.totalCandles).toBeGreaterThan(0);
  });

  test("accepts period option", async () => {
    const session = await createReplay("THYAO", { period: "6mo" });
    expect(session).toBeInstanceOf(ReplaySession);
  });

  test("accepts interval option", async () => {
    const session = await createReplay("THYAO", { interval: "1d" });
    expect(session).toBeInstanceOf(ReplaySession);
  });

  test("accepts speed option", async () => {
    const session = await createReplay("THYAO", { speed: 5 });
    expect(session.stats().speed).toBe(5);
  });

  test("accepts realtimeInjection option", async () => {
    const session = await createReplay("THYAO", { realtimeInjection: true });
    expect(session.stats().realtimeInjection).toBe(true);
  });
});
