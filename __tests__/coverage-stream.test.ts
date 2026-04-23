import events from "events";
import { TradingViewStream } from "~/stream";

declare global {
  var lastSocket: events.EventEmitter | null;
  var mockSend: jest.Mock;
  var mockClose: jest.Mock;
}

jest.mock("ws", () => {
  const EventEmitter = require("events");
  if (!global.mockSend) global.mockSend = jest.fn();
  if (!global.mockClose) global.mockClose = jest.fn();
  class MockWebSocket extends EventEmitter {
    static OPEN = 1;
    readyState = 1;
    send = global.mockSend;
    close = global.mockClose;
    constructor() {
      super();
      global.lastSocket = this as unknown as events.EventEmitter;
    }
  }
  return MockWebSocket;
});

jest.mock("~/providers/pine-facade", () => ({
  getPineFacadeProvider: () => ({
    getIndicator: jest.fn().mockResolvedValue({
      pineId: "STD;RSI",
      defaults: { length: 14 },
    }),
  }),
  INDICATOR_OUTPUTS: { "STD;RSI": { plot_0: "rsi" } },
}));

jest.mock("~/providers/tradingview", () => ({
  getTradingViewAuth: () => ({ authToken: "mock_token" }),
}));

describe("Stream Coverage Boost", () => {
  let stream: TradingViewStream;

  beforeEach(() => {
    jest.clearAllMocks();
    global.lastSocket = null;
    if (global.mockSend) global.mockSend.mockClear();
    if (global.mockClose) global.mockClose.mockClear();
    stream = new TradingViewStream();
  });

  async function connectStream() {
    const p = stream.connect();
    global.lastSocket!.emit("open");
    await p;
  }

  describe("Quote methods", () => {
    test("waitForQuote returns cached quote", async () => {
      await connectStream();
      const qsd = JSON.stringify({
        m: "qsd",
        p: ["qs", { n: "BIST:THYAO", v: { lp: 100, ch: 1, chp: 1 } }],
      });
      global.lastSocket!.emit("message", `~m~${qsd.length}~m~${qsd}`);
      const q = await stream.waitForQuote("THYAO");
      expect(q.symbol).toBe("BIST:THYAO");
    });

    test("waitForQuote times out", async () => {
      await connectStream();
      stream.subscribe("GARAN");
      await expect(stream.waitForQuote("GARAN", "BIST", 100)).rejects.toThrow("Timeout");
    });

    test("waitForQuote resolves on event", async () => {
      await connectStream();
      stream.subscribe("ASELS");
      const promise = stream.waitForQuote("ASELS", "BIST", 5000);
      const qsd = JSON.stringify({
        m: "qsd",
        p: ["qs", { n: "BIST:ASELS", v: { lp: 50 } }],
      });
      global.lastSocket!.emit("message", `~m~${qsd.length}~m~${qsd}`);
      const q = await promise;
      expect(q.lp).toBe(50);
    });

    test("subscribeMultiple and unsubscribeMultiple", async () => {
      await connectStream();
      stream.subscribeMultiple(["THYAO", "GARAN"]);
      stream.unsubscribeMultiple(["THYAO", "GARAN"]);
      expect(stream.getQuote("THYAO")).toBeNull();
    });

    test("onAnyQuote callback", async () => {
      await connectStream();
      const cb = jest.fn();
      stream.onAnyQuote(cb);
      stream.emit("quote", { symbol: "BIST:THYAO", lp: 100 });
      expect(cb).toHaveBeenCalled();
    });

    test("onQuote filters by symbol", async () => {
      await connectStream();
      const cb = jest.fn();
      stream.onQuote("THYAO", cb);
      stream.emit("quote", { symbol: "BIST:THYAO", lp: 100 });
      stream.emit("quote", { symbol: "BIST:GARAN", lp: 50 });
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  describe("Chart methods", () => {
    test("subscribeChart duplicate ignored", async () => {
      await connectStream();
      stream.subscribeChart("THYAO", "1m");
      const count1 = global.mockSend.mock.calls.length;
      stream.subscribeChart("THYAO", "1m");
      expect(global.mockSend.mock.calls.length).toBe(count1);
    });

    test("getCandle and getCandles return null/empty before data", async () => {
      await connectStream();
      expect(stream.getCandle("THYAO", "1m")).toBeNull();
      expect(stream.getCandles("THYAO", "1m")).toEqual([]);
    });

    test("getCandles with count", async () => {
      await connectStream();
      stream.subscribeChart("THYAO", "1m");
      // Inject chart data
      const pkt = JSON.stringify({
        m: "timescale_update",
        p: ["cs", { s1: { s: [
          { v: [1704067200, 100, 105, 98, 102, 1000] },
          { v: [1704067260, 102, 106, 101, 104, 1100] },
          { v: [1704067320, 104, 108, 103, 107, 1200] },
        ] } }],
      });
      global.lastSocket!.emit("message", `~m~${pkt.length}~m~${pkt}`);
      const all = stream.getCandles("THYAO", "1m");
      expect(all.length).toBe(3);
      const last2 = stream.getCandles("THYAO", "1m", 2);
      expect(last2.length).toBe(2);
    });

    test("waitForCandle returns existing candle", async () => {
      await connectStream();
      stream.subscribeChart("THYAO", "5m");
      const pkt = JSON.stringify({
        m: "timescale_update",
        p: ["cs", { s1: { s: [{ v: [1704067200, 100, 105, 98, 102, 1000] }] } }],
      });
      global.lastSocket!.emit("message", `~m~${pkt.length}~m~${pkt}`);
      const c = await stream.waitForCandle("THYAO", "5m", 1000);
      expect(c.close).toBe(102);
    });

    test("waitForCandle times out", async () => {
      await connectStream();
      stream.subscribeChart("GARAN", "1m");
      await expect(stream.waitForCandle("GARAN", "1m", 100)).rejects.toThrow("Timeout");
    });

    test("waitForCandle resolves on event", async () => {
      await connectStream();
      stream.subscribeChart("ASELS", "1d");
      const promise = stream.waitForCandle("ASELS", "1d", 5000);
      // Need to get the correct series ID
      const pkt = JSON.stringify({
        m: "timescale_update",
        p: ["cs", { s1: { s: [{ v: [1704067200, 50, 55, 48, 52, 500] }] } }],
      });
      global.lastSocket!.emit("message", `~m~${pkt.length}~m~${pkt}`);
      // May not match seriesIdMap, but tests the event path
      setTimeout(() => {
        stream.emit("candle", { symbol: "BIST:ASELS", interval: "1d", candle: { time: new Date(), open: 50, high: 55, low: 48, close: 52, volume: 500 } });
      }, 50);
      const c = await promise;
      expect(c.close).toBe(52);
    });

    test("onCandle filters by symbol and interval", async () => {
      await connectStream();
      const cb = jest.fn();
      stream.onCandle("THYAO", "1m", cb);
      stream.emit("candle", { symbol: "BIST:THYAO", interval: "1m", candle: { time: new Date(), open: 1, high: 2, low: 0, close: 1.5, volume: 100 } });
      stream.emit("candle", { symbol: "BIST:GARAN", interval: "1m", candle: { time: new Date(), open: 1, high: 2, low: 0, close: 1.5, volume: 100 } });
      expect(cb).toHaveBeenCalledTimes(1);
    });

    test("onAnyCandle receives all candle events", async () => {
      await connectStream();
      const cb = jest.fn();
      stream.onAnyCandle(cb);
      stream.emit("candle", { symbol: "BIST:THYAO", interval: "1m", candle: {} });
      expect(cb).toHaveBeenCalledTimes(1);
    });

    test("unsubscribeChart for non-existent does nothing", async () => {
      await connectStream();
      stream.unsubscribeChart("NONEXIST", "1m");
    });

    test("chart data merges and updates existing candles", async () => {
      await connectStream();
      stream.subscribeChart("THYAO", "1d");
      const pkt1 = JSON.stringify({
        m: "timescale_update",
        p: ["cs", { s1: { s: [{ v: [1704067200, 100, 105, 98, 102, 1000] }] } }],
      });
      global.lastSocket!.emit("message", `~m~${pkt1.length}~m~${pkt1}`);
      // Update same timestamp
      const pkt2 = JSON.stringify({
        m: "du",
        p: ["cs", { s1: { s: [{ v: [1704067200, 100, 110, 95, 108, 2000] }] } }],
      });
      global.lastSocket!.emit("message", `~m~${pkt2.length}~m~${pkt2}`);
      const c = stream.getCandle("THYAO", "1d");
      expect(c?.close).toBe(108);
    });
  });

  describe("_handlePacket edge cases", () => {
    test("handles series_completed", async () => {
      await connectStream();
      const internal = stream as unknown as { _handlePacket: (p: unknown) => void };
      internal._handlePacket({ m: "series_completed", p: [] });
    });

    test("handles unknown packet type", async () => {
      await connectStream();
      const internal = stream as unknown as { _handlePacket: (p: unknown) => void };
      internal._handlePacket({ m: "unknown_method", p: [] });
    });

    test("handles null/missing m", async () => {
      await connectStream();
      const internal = stream as unknown as { _handlePacket: (p: unknown) => void };
      internal._handlePacket({});
      internal._handlePacket(null);
    });
  });

  describe("Reconnect logic", () => {
    test("_reconnect does nothing when shouldReconnect is false", async () => {
      await connectStream();
      stream.disconnect(); // sets _shouldReconnect = false
      const internal = stream as unknown as { _reconnect: () => Promise<void> };
      await internal._reconnect();
    });

    test("_reconnect does nothing when already reconnecting", async () => {
      await connectStream();
      const internal = stream as unknown as {
        _reconnecting: boolean;
        _shouldReconnect: boolean;
        _reconnect: () => Promise<void>;
      };
      internal._reconnecting = true;
      internal._shouldReconnect = true;
      await internal._reconnect();
    });
  });
});
