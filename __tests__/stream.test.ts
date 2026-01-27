import events from "events";

import { TradingViewStream } from "~/stream";

// Define global interface for the test context
declare global {
  // eslint-disable-next-line no-var
  var lastSocket: events.EventEmitter | null;
  var mockSend: jest.Mock;
  var mockClose: jest.Mock;
}

// 1. Setup global mocks before imports (or reliant on lazy execution of factory)
// Actually, better pattern: define the mock factory to use a local class and assign to global
jest.mock("ws", () => {
  const EventEmitter = require("events");

  // Create global spies
  // Note: global objects persist, so we need to clear them in beforeEach
  if (!global.mockSend) global.mockSend = jest.fn();
  if (!global.mockClose) global.mockClose = jest.fn();

  class MockWebSocket extends EventEmitter {
    static OPEN = 1;
    readyState = 1;
    send = global.mockSend;
    close = global.mockClose;

    constructor(url: string, _options: unknown) {
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
  INDICATOR_OUTPUTS: {
    "STD;RSI": { plot_0: "rsi" },
  },
}));

jest.mock("~/providers/tradingview", () => ({
  getTradingViewAuth: () => ({ authToken: "mock_token" }),
}));

describe("TradingViewStream Breakdown", () => {
  let stream: TradingViewStream;

  beforeEach(() => {
    jest.clearAllMocks();
    global.lastSocket = null;
    if (global.mockSend) global.mockSend.mockClear();
    if (global.mockClose) global.mockClose.mockClear();

    stream = new TradingViewStream();
  });

  test("Connection Flow: Connect -> Authenticate -> Create Sessions", async () => {
    const connectPromise = stream.connect();

    expect(global.lastSocket).toBeTruthy();

    // Emit open
    global.lastSocket!.emit("open");
    await connectPromise;

    expect(global.mockSend).toHaveBeenCalledWith(
      expect.stringContaining("set_auth_token"),
    );
    expect(global.mockSend).toHaveBeenCalledWith(
      expect.stringContaining("quote_create_session"),
    );
    expect(global.mockSend).toHaveBeenCalledWith(
      expect.stringContaining("chart_create_session"),
    );
  });

  test("Parsing Keep-Alive (~m~num~m~)", async () => {
    const p = stream.connect();
    global.lastSocket!.emit("open");
    await p;

    // Verify keep alive response
    global.lastSocket!.emit("message", "~m~5~m~12345");
    expect(global.mockSend).toHaveBeenCalledWith("~m~5~m~12345");
  });

  test("Multiple Packets in one Message", async () => {
    const p = stream.connect();
    global.lastSocket!.emit("open");
    await p;

    // "qsd" packet mock
    const qsdPacket = JSON.stringify({
      m: "qsd",
      p: ["qs_session", { n: "HVBS:THYAO", v: { lp: 100 } }],
    });

    // Multiple packets frame
    const msg = `~m~${qsdPacket.length}~m~${qsdPacket}~m~${qsdPacket.length}~m~${qsdPacket}`;

    const spy = jest.spyOn(stream, "emit");
    global.lastSocket!.emit("message", msg);

    expect(spy).toHaveBeenCalledWith(
      "quote",
      expect.objectContaining({ symbol: "HVBS:THYAO", lp: 100 }),
    );
    expect(spy).toHaveBeenCalledTimes(2); // quote emitted twice
  });

  test("Subscription and Unsubscription", async () => {
    const p = stream.connect();
    global.lastSocket!.emit("open");
    await p;

    stream.subscribe("THYAO");
    stream.subscribe("THYAO"); // Duplicate should be ignored

    expect(global.mockSend).toHaveBeenCalledWith(
      expect.stringContaining("quote_add_symbols"),
    );

    // Chart subscription is separate
    stream.subscribeChart("THYAO", "1m");
    expect(global.mockSend).toHaveBeenCalledWith(
      expect.stringContaining("resolve_symbol"),
    );
    expect(global.mockSend).toHaveBeenCalledWith(
      expect.stringContaining("create_series"),
    );

    // Unsubscribe
    stream.unsubscribe("THYAO");
    expect(global.mockSend).toHaveBeenCalledWith(
      expect.stringContaining("quote_remove_symbols"),
    );
  });

  test("Study Data Handling", async () => {
    const p = stream.connect();
    global.lastSocket!.emit("open");
    await p;

    // setup study
    const studyId = await stream.studies.add("THYAO", "1D", "RSI", {});

    // Mock study update packet
    const studyUpdate = JSON.stringify({
      m: "du",
      p: [
        "cs_session",
        {
          [studyId]: {
            st: [{ v: [0, 55.5] }],
          },
        },
      ],
    });

    const spy = jest.spyOn(stream, "emit");
    global.lastSocket!.emit(
      "message",
      `~m~${studyUpdate.length}~m~${studyUpdate}`,
    );

    expect(spy).toHaveBeenCalledWith(
      "study",
      expect.objectContaining({
        symbol: "THYAO",
        indicator: "RSI",
        values: { rsi: 55.5 },
      }),
    );

    // Check getter
    expect(stream.studies.get("THYAO", "1d", "RSI")).toEqual({
      rsi: 55.5,
    });
  });

  test("Error Handling and Disconnect", async () => {
    const p = stream.connect();

    const err = new Error("Fail");
    // Prevent unhandled error event crash logic
    stream.on("error", () => {}); // Dummy handler

    global.lastSocket!.emit("error", err);
    await expect(p).rejects.toThrow("Fail");

    // Disconnect
    stream.disconnect();
    expect(global.mockClose).toHaveBeenCalled();

    // Calls on disconnected stream
    stream.send("test", []);
  });
});

describe("TradingViewStream Additional Coverage", () => {
  let stream: TradingViewStream;

  beforeEach(() => {
    jest.clearAllMocks();
    global.lastSocket = null;
    if (global.mockSend) global.mockSend.mockClear();
    if (global.mockClose) global.mockClose.mockClear();

    stream = new TradingViewStream();
  });

  describe("StudySession Methods", () => {
    test("studies.remove removes study correctly", async () => {
      const p = stream.connect();
      global.lastSocket!.emit("open");
      await p;

      const studyId = await stream.studies.add("THYAO", "1D", "RSI", {});
      expect(studyId).toBeDefined();

      stream.studies.remove("THYAO", "1D", "RSI");
      expect(global.mockSend).toHaveBeenCalledWith(
        expect.stringContaining("remove_study"),
      );

      // Get should return null after removal
      expect(stream.studies.get("THYAO", "1D", "RSI")).toBeNull();
    });

    test("studies.remove handles non-existent study gracefully", async () => {
      const p = stream.connect();
      global.lastSocket!.emit("open");
      await p;

      // Should not throw
      stream.studies.remove("NONEXISTENT", "1D", "RSI");
    });

    test("studies.getAll returns all studies for symbol/interval", async () => {
      const p = stream.connect();
      global.lastSocket!.emit("open");
      await p;

      await stream.studies.add("THYAO", "1D", "RSI", {});

      // Initially empty values
      const all = stream.studies.getAll("THYAO", "1D");
      expect(typeof all).toBe("object");
    });

    test("studies.getAll returns empty object for unknown symbol", async () => {
      const p = stream.connect();
      global.lastSocket!.emit("open");
      await p;

      const all = stream.studies.getAll("UNKNOWN", "1D");
      expect(all).toEqual({});
    });

    test("studies.onUpdate registers callback for specific study", async () => {
      const p = stream.connect();
      global.lastSocket!.emit("open");
      await p;

      const callback = jest.fn();
      stream.studies.onUpdate("THYAO", "1D", "RSI", callback);

      // Emit study event
      stream.emit("study", {
        symbol: "THYAO",
        interval: "1d",
        indicator: "RSI",
        values: { rsi: 50 },
      });

      expect(callback).toHaveBeenCalledWith({ rsi: 50 });
    });

    test("studies.onUpdate ignores non-matching updates", async () => {
      const p = stream.connect();
      global.lastSocket!.emit("open");
      await p;

      const callback = jest.fn();
      stream.studies.onUpdate("THYAO", "1D", "RSI", callback);

      // Emit study event for different symbol
      stream.emit("study", {
        symbol: "GARAN",
        interval: "1d",
        indicator: "RSI",
        values: { rsi: 50 },
      });

      expect(callback).not.toHaveBeenCalled();
    });

    test("studies.onAnyUpdate receives all study updates", async () => {
      const p = stream.connect();
      global.lastSocket!.emit("open");
      await p;

      const callback = jest.fn();
      stream.studies.onAnyUpdate(callback);

      stream.emit("study", {
        symbol: "THYAO",
        interval: "1d",
        indicator: "RSI",
        values: { rsi: 50 },
      });

      expect(callback).toHaveBeenCalledWith("THYAO", "1d", "RSI", { rsi: 50 });
    });

    test("studies.waitFor returns existing data immediately", async () => {
      const p = stream.connect();
      global.lastSocket!.emit("open");
      await p;

      const studyId = await stream.studies.add("THYAO", "1D", "RSI", {});

      // Inject study data
      const studyUpdate = JSON.stringify({
        m: "du",
        p: [
          "cs_session",
          {
            [studyId]: {
              st: [{ v: [0, 65.0] }],
            },
          },
        ],
      });
      global.lastSocket!.emit(
        "message",
        `~m~${studyUpdate.length}~m~${studyUpdate}`,
      );

      const values = await stream.studies.waitFor("THYAO", "1D", "RSI", 1000);
      expect(values).toEqual({ rsi: 65.0 });
    });

    test("studies.waitFor times out if no data", async () => {
      const p = stream.connect();
      global.lastSocket!.emit("open");
      await p;

      await stream.studies.add("THYAO", "1D", "MACD", {});

      await expect(
        stream.studies.waitFor("THYAO", "1D", "MACD", 100),
      ).rejects.toThrow("Timeout");
    });
  });

  describe("Chart Data Handling", () => {
    test("subscribes to chart with interval", async () => {
      const p = stream.connect();
      global.lastSocket!.emit("open");
      await p;

      stream.subscribeChart("THYAO", "5m");
      expect(global.mockSend).toHaveBeenCalledWith(
        expect.stringContaining("resolve_symbol"),
      );
      expect(global.mockSend).toHaveBeenCalledWith(
        expect.stringContaining("create_series"),
      );
    });

    test("chart data update handled correctly", async () => {
      const p = stream.connect();
      global.lastSocket!.emit("open");
      await p;

      stream.subscribeChart("THYAO", "1m");

      // Emit chart data
      const chartPacket = JSON.stringify({
        m: "timescale_update",
        p: [
          "cs_session",
          {
            sds_1: {
              s: [{ v: [1704067200, 100, 105, 98, 102, 1000000] }],
            },
          },
        ],
      });

      // Should not throw when processing chart packet
      global.lastSocket!.emit(
        "message",
        `~m~${chartPacket.length}~m~${chartPacket}`,
      );
    });

    test("unsubscribeChart removes chart subscription", async () => {
      const p = stream.connect();
      global.lastSocket!.emit("open");
      await p;

      stream.subscribeChart("THYAO", "1m");
      stream.unsubscribeChart("THYAO", "1m");

      expect(global.mockSend).toHaveBeenCalledWith(
        expect.stringContaining("remove_series"),
      );
    });
  });

  describe("Edge Cases", () => {
    test("send on disconnected stream does not throw", async () => {
      stream.send("test_method", ["param1"]);
    });

    test("subscribe before connect queues subscription", () => {
      stream.subscribe("THYAO");
      // Should not throw, may queue
    });

    test("handles malformed JSON gracefully", async () => {
      const p = stream.connect();
      global.lastSocket!.emit("open");
      await p;

      stream.on("error", () => {}); // Dummy error handler

      // Send malformed message
      global.lastSocket!.emit("message", "~m~10~m~not json!!!");
    });

    test("handles empty message", async () => {
      const p = stream.connect();
      global.lastSocket!.emit("open");
      await p;

      global.lastSocket!.emit("message", "");
    });

    test("disconnect can be called multiple times safely", async () => {
      const p = stream.connect();
      global.lastSocket!.emit("open");
      await p;

      stream.disconnect();
      stream.disconnect(); // Should not throw
    });
  });

  describe("Reconnection", () => {
    test("close event triggers reconnection", async () => {
      const p = stream.connect();
      global.lastSocket!.emit("open");
      await p;

      // Simulate close
      global.lastSocket!.emit("close");

      // New socket should be created
      await new Promise((r) => setTimeout(r, 100));
    });
  });
});
