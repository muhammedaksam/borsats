import { Bond } from "~/bond";
import { APIError } from "~/exceptions";
import { banks, metalInstitutions } from "~/fx";
import { download, Tickers } from "~/multi";
import { getTEFASProvider } from "~/providers/tefas";
import {
  clearTradingViewAuth,
  getTradingViewProvider,
  setTradingViewAuth,
} from "~/providers/tradingview";
import { getTVScreenerProvider } from "~/providers/tradingview-screener-native";
import {
  getSearchProvider,
  TradingViewSearchProvider,
} from "~/providers/tradingview-search";
import { TechnicalScanner } from "~/scanner";
import { StudySession, TradingViewStream } from "~/stream";
import { Ticker } from "~/ticker";
import { Interval } from "~/types";

describe("Coverage Boost Tests", () => {
  describe("FX Coverage", () => {
    test("banks and metalInstitutions", async () => {
      const b = await banks();
      const m = await metalInstitutions();
      expect(Array.isArray(b)).toBe(true);
      expect(Array.isArray(m)).toBe(true);
    });
  });

  describe("Bond/Eurobond Coverage", () => {
    test("Bond getters", async () => {
      const bond = new Bond("2Y");
      expect(bond.maturity).toBe("2Y");
    });
  });

  describe("Stream and Scanner Coverage", () => {
    test("Scanner methods with compound conditions", async () => {
      const scanner = new TechnicalScanner();
      await scanner.setUniverse(["THYAO", "ASELS"]);

      scanner.addSymbol("GARAN");
      expect(scanner.symbols).toContain("GARAN");
      scanner.removeSymbol("GARAN");
      expect(scanner.symbols).not.toContain("GARAN");

      scanner.addCondition("rsi_14 > 70 and close > sma_20", "complex");
      expect(scanner.conditions).toContain("rsi_14 > 70");
      expect(scanner.conditions).toContain("close > sma_20");

      scanner.removeCondition("complex");
      scanner.removeCondition("rsi_14 > 70");
      expect(scanner.conditions).not.toContain("rsi_14 > 70");

      scanner.clearConditions();
      expect(scanner.conditions.length).toBe(0);

      scanner.setInterval("1h");
      expect((scanner as unknown as { _interval: string })._interval).toBe(
        "1h",
      );
      scanner.setInterval("invalid" as Interval);
      expect((scanner as unknown as { _interval: string })._interval).toBe(
        "1h",
      );

      scanner.addColumn("market_cap");
      // @ts-expect-error accessing private
      expect(scanner._extraColumns).toContain("market_cap");
    });

    test("Scanner _evaluateCondition and _getValue branches", () => {
      const scanner = new TechnicalScanner();
      const data = { rsi: 30, close: 100, volume: 1000000, sma_50: 90 };

      // @ts-expect-error accessing private
      expect(scanner._evaluateCondition("rsi <= 30", data)).toBe(true);
      // @ts-expect-error accessing private
      expect(scanner._evaluateCondition("rsi >= 30", data)).toBe(true);
      // @ts-expect-error accessing private
      expect(scanner._evaluateCondition("close == 100", data)).toBe(true);
      // @ts-expect-error accessing private
      expect(scanner._evaluateCondition("close != 90", data)).toBe(true);
      // @ts-expect-error accessing private
      expect(scanner._evaluateCondition("close > 50", data)).toBe(true);
      // @ts-expect-error accessing private
      expect(scanner._evaluateCondition("close < 150", data)).toBe(true);

      // @ts-expect-error accessing private
      expect(scanner._getValue("1M", data)).toBe(1000000);
      // @ts-expect-error accessing private
      expect(scanner._getValue("1K", data)).toBe(1000);
      // @ts-expect-error accessing private
      expect(scanner._getValue("invalid", data)).toBeNull();
    });

    test("TechnicalScanner run with empty universe/conditions", async () => {
      const scanner = new TechnicalScanner();
      const res = await scanner.run();
      expect(res).toEqual([]);
    });

    test("TechnicalScanner run with local calc requirements", async () => {
      const sc = new TechnicalScanner();
      await sc.setUniverse(["THYAO"]);
      sc.addCondition("supertrend > 0");
      const needsLocal = (
        sc as unknown as {
          _conditions: string[];
          _requiresLocalCalc: (c: string) => boolean;
        }
      )._conditions.some((c: string) =>
        (
          sc as unknown as { _requiresLocalCalc: (c: string) => boolean }
        )._requiresLocalCalc(c),
      );
      expect(needsLocal).toBe(true);
    });

    test("Stream basic instantiation and internal parser", () => {
      const stream = new TradingViewStream();
      expect(stream).toBeDefined();

      const internalStream = stream as unknown as {
        _parseMessage: (m: string) => void;
        _handlePacket: (p: { m: string; p: unknown[] }) => void;
      };

      internalStream._parseMessage("~h~123");
      internalStream._parseMessage("~m~10~m~{invalid}");
      internalStream._handlePacket({
        m: "qsd",
        p: ["session", { n: "BIST:THYAO", v: { lp: 100, ch: 1, chp: 1 } }],
      });
      expect(stream.getQuote("THYAO")).toBeDefined();
    });

    test("StudySession methods", async () => {
      const stream = new TradingViewStream();
      const session = new StudySession(stream);

      session.handleData("st1", { st: [] });

      const inputs = (
        session as unknown as {
          _buildTvInputs: (o: {
            indicatorId: string;
            metadata: { defaults: Record<string, unknown> };
            inputs: Record<string, unknown>;
          }) => Record<string, { t: string; v: unknown }>;
        }
      )._buildTvInputs({
        indicatorId: "STD;RSI",
        metadata: { defaults: { length: 14, overbought: true, price: 50.5 } },
        inputs: {},
      });
      expect(inputs.in_0.t).toBe("integer");
      expect(inputs.in_1.t).toBe("boolean");
      expect(inputs.in_2.t).toBe("float");
    });
  });

  describe("Multi Tickers Coverage", () => {
    test("Tickers class various inputs", () => {
      const t1 = new Tickers("THYAO ASELS");
      expect(t1.symbols).toContain("THYAO");

      const t2 = new Tickers(["XU100"]);
      expect(t2.symbols).toContain("XU100");
    });

    test("download method error handling", async () => {
      const histSpy = jest
        .spyOn(Ticker.prototype, "history")
        .mockRejectedValueOnce(new Error("Invalid symbol"));
      try {
        const results = await download(["INVALID!!"], { period: "1d" });
        expect(results).toEqual({});
      } finally {
        histSpy.mockRestore();
      }
    });
  });

  describe("TVScreenerProvider Coverage", () => {
    const screener = getTVScreenerProvider();

    test("Column mapping with dynamic indicators", () => {
      expect(screener.getTVColumn("sma_50")).toBe("SMA50");
      expect(screener.getTVColumn("ema_21")).toBe("EMA21");
      expect(screener.getTVColumn("rsi_14")).toBe("RSI");
      expect(screener.getTVColumn("rsi_7")).toBe("RSI7");
      expect(screener.getTVColumn("custom_field")).toBe("custom_field");
      expect(screener.getTVColumn("close", "1h")).toBe("close|60");
    });

    test("parseNumber with suffixes", () => {
      expect(screener.parseNumber("1.5K")).toBe(1500);
      expect(screener.parseNumber("2M")).toBe(2000000);
      expect(screener.parseNumber("3B")).toBe(3000000000);
      expect(screener.parseNumber("123.45")).toBe(123.45);
    });

    test("requiresLocalCalc branches", () => {
      expect(screener.requiresLocalCalc("supertrend")).toBe(true);
      expect(screener.requiresLocalCalc("supertrend_direction")).toBe(true);
      expect(screener.requiresLocalCalc("t3_10")).toBe(true);
      expect(screener.requiresLocalCalc("close")).toBe(false);
    });

    test("parseCondition logic", () => {
      const c1 = screener.parseCondition("close > 100", "1d");
      expect(c1).toEqual({ left: "close", operator: ">", right: 100 });

      const c2 = screener.parseCondition("rsi < sma_20", "1d");
      expect(c2).toEqual({ left: "RSI", operator: "<", right: "SMA20" });

      expect(screener.parseCondition("invalid condition", "1d")).toBeNull();
    });

    test("separateConditions logic", () => {
      const sep = screener.separateConditions(["close > 0", "supertrend > 10"]);
      expect(sep.api).toContain("close > 0");
      expect(sep.local).toContain("supertrend > 10");
    });
  });

  describe("TEFASProvider Coverage", () => {
    const tefas = getTEFASProvider();

    test("Date formatting helpers", () => {
      const date = new Date(Date.UTC(2023, 0, 1, 12, 0, 0));
      const internalTefas = tefas as unknown as {
        _formatDateISO: (d: Date) => string;
        _formatDateCompact: (d: Date) => string;
      };
      expect(internalTefas._formatDateISO(date)).toBe("2023-01-01");
      expect(internalTefas._formatDateCompact(date)).toBe("20230101");
    });
  });

  describe("TradingViewProvider Coverage", () => {
    const tv = getTradingViewProvider();

    test("Auth credentials management", async () => {
      clearTradingViewAuth();
      await expect(setTradingViewAuth({})).rejects.toThrow();

      const getUserSpy = jest.spyOn(tv, "getUser").mockResolvedValueOnce({
        id: 42,
        username: "tester",
        authToken: "real_tv_token",
        session: "fake_session",
        sessionSign: "fake_sign",
        user: { id: 42, username: "tester", auth_token: "real_tv_token" },
      });
      try {
        await setTradingViewAuth({
          session: "fake_session",
          sessionSign: "fake_sign",
        });
        // @ts-expect-error accessing private
        expect(tv.getAuthToken()).toBe("real_tv_token");
      } finally {
        getUserSpy.mockRestore();
        clearTradingViewAuth();
      }
    });

    test("calculateBars logic coverage", () => {
      // @ts-expect-error accessing private
      expect(tv.calculateBars("1mo", "1d")).toBeGreaterThan(10);
      // @ts-expect-error accessing private
      expect(tv.calculateBars("ytd", "1h")).toBeGreaterThan(10);

      const now = new Date();
      const past = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
      // @ts-expect-error accessing private
      expect(tv.calculateBars("", "1d", past, now)).toBe(10);
    });

    test("packet parser branches", () => {
      // @ts-expect-error accessing private
      const p1 = tv.parsePackets('~m~10~m~{"m":"h"}~m~5~m~"foo"');
      expect(p1.length).toBe(2);

      // @ts-expect-error accessing private
      const p2 = tv.parsePackets("~h~123");
      expect(p2.length).toBe(0);
    });

    test("executeWithRetry logic", async () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      let count = 0;
      const op = async () => {
        count++;
        if (count < 2) throw new APIError("429 rate limit");
        return "success";
      };
      try {
        // @ts-expect-error accessing private
        const res = await tv.executeWithRetry(op, 3, 10);
        expect(res).toBe("success");
        expect(count).toBe(2);
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe("TradingViewSearchProvider Coverage", () => {
    let provider: TradingViewSearchProvider;

    beforeAll(() => {
      provider = getSearchProvider();
    });

    test("monthCodeToName mapping", () => {
      expect(TradingViewSearchProvider.monthCodeToName("F")).toBe("January");
      expect(TradingViewSearchProvider.monthCodeToName("Z")).toBe("December");
      expect(TradingViewSearchProvider.monthCodeToName("INVALID")).toBe("");
    });

    test("search with empty query should return empty array", async () => {
      const result = await provider.search("   ");
      expect(result).toEqual([]);
    });
  });
});
