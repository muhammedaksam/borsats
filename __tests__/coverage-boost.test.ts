import {
  backtest,
  BacktestEngine,
  Candle,
  Position,
  StrategyFunc,
} from "~/backtest";
import { Index } from "~/bist-index";
import { Bond } from "~/bond";
import { Eurobond } from "~/eurobond";
import { APIError } from "~/exceptions";
import { banks, FX, metalInstitutions } from "~/fx";
import { Inflation } from "~/inflation";
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
import { Interval } from "~/types";
import { resilientTest } from "./helpers/network-utils";

describe("Coverage Boost Tests", () => {
  jest.setTimeout(120000);

  describe("BIST Index Coverage", () => {
    test(
      "taSignalsAllTimeframes should handle errors gracefully",
      resilientTest(async () => {
        const idx = new Index("INVALID_INDEX");
        const signals = await idx.taSignalsAllTimeframes();
        expect(signals["1d"]).toHaveProperty("error");
      }, 1),
    );

    test(
      "scan should work with options",
      resilientTest(async () => {
        const idx = new Index("XU100");
        const results = await idx.scan("rsi < 30", { interval: "1h" });
        expect(Array.isArray(results)).toBe(true);
      }, 1),
    );
  });

  describe("Backtest Coverage", () => {
    test(
      "BacktestEngine should handle indicators with periods",
      resilientTest(async () => {
        const strategy: StrategyFunc = (
          candle: Candle,
          pos: Position,
          indices: Record<string, number>,
        ) => {
          if (indices.rsi_14 < 30) return "BUY";
          if (indices.rsi_14 > 70) return "SELL";
          return "HOLD";
        };
        const engine = new BacktestEngine("THYAO", strategy, {
          period: "1mo",
          indicators: ["rsi_14", "sma_50"],
        });
        const result = await engine.run();
        expect(result.strategyName).toBe("strategy");
      }, 1),
    );

    test(
      "Backtest summary formatting",
      resilientTest(async () => {
        const strategy: StrategyFunc = () => "HOLD";
        const result = await backtest("THYAO", strategy, { period: "5d" });
        const summary = result.summary();
        expect(summary).toContain("BACKTEST RESULTS: THYAO");
        expect(summary).toContain("Sharpe Ratio:");
      }, 1),
    );

    test(
      "Backtest SELL logic and metrics",
      resilientTest(async () => {
        let tradeDone = false;
        const strategy: StrategyFunc = (candle: Candle, pos: Position) => {
          if (pos === null && !tradeDone) {
            tradeDone = true;
            return "BUY";
          }
          if (pos === "long") return "SELL";
          return "HOLD";
        };
        const result = await backtest("THYAO", strategy, {
          period: "1mo",
        });
        expect(result.totalTrades).toBeGreaterThan(0);
        expect(result.netProfit).toBeDefined();
      }, 1),
    );
  });

  describe("FX Coverage", () => {
    test(
      "FX current and history",
      resilientTest(async () => {
        const fx = new FX("USD");
        const data = await fx.current;
        expect(data).toHaveProperty("last");

        const hist = await fx.history({ period: "1d", interval: "1h" });
        expect(Array.isArray(hist)).toBe(true);
      }, 1),
    );

    test(
      "FX TA signals",
      resilientTest(async () => {
        const fx = new FX("USD");
        const signals = await fx.taSignals();
        expect(signals).toHaveProperty("summary");

        const all = await fx.taSignalsAllTimeframes();
        expect(all).toHaveProperty("1d");
      }, 1),
    );

    test("banks and metalInstitutions", async () => {
      const b = await banks();
      const m = await metalInstitutions();
      expect(Array.isArray(b)).toBe(true);
      expect(Array.isArray(m)).toBe(true);
    });
  });

  describe("Inflation Coverage", () => {
    test(
      "tufe and ufe with options",
      resilientTest(async () => {
        const inf = new Inflation();
        const data1 = await inf.tufe({ limit: 2 });
        const data2 = await inf.ufe({ limit: 2 });
        expect(data1.length).toBeLessThanOrEqual(2);
        expect(data2.length).toBeLessThanOrEqual(2);
      }),
    );
  });

  describe("Bond/Eurobond Coverage", () => {
    test("Bond getters", async () => {
      const bond = new Bond("2Y");
      expect(bond.maturity).toBe("2Y");
    });

    test(
      "Eurobond getters",
      resilientTest(async () => {
        const eb = new Eurobond("US900123AL40");
        expect(eb.isin).toBe("US900123AL40");
        const curr = await eb.currency();
        expect(curr).toBe("USD");
      }, 1),
    );
  });

  describe("Stream and Scanner Coverage", () => {
    test("Scanner methods with compound conditions", async () => {
      const scanner = new TechnicalScanner();
      await scanner.setUniverse(["THYAO", "ASELS"]);

      // Test addSymbol / removeSymbol
      scanner.addSymbol("GARAN");
      expect(scanner.symbols).toContain("GARAN");
      scanner.removeSymbol("GARAN");
      expect(scanner.symbols).not.toContain("GARAN");

      // Test addCondition splitting and names
      scanner.addCondition("rsi_14 > 70 and close > sma_20", "complex");
      expect(scanner.conditions).toContain("rsi_14 > 70");
      expect(scanner.conditions).toContain("close > sma_20");

      // Test removeCondition
      scanner.removeCondition("complex");
      scanner.removeCondition("rsi_14 > 70");
      expect(scanner.conditions).not.toContain("rsi_14 > 70");

      // Test clearConditions
      scanner.clearConditions();
      expect(scanner.conditions.length).toBe(0);

      // Test setInterval
      scanner.setInterval("1h");
      expect((scanner as unknown as { _interval: string })._interval).toBe(
        "1h",
      );
      scanner.setInterval("invalid" as Interval);
      expect((scanner as unknown as { _interval: string })._interval).toBe(
        "1h",
      ); // Should not change

      // Test addColumn
      scanner.addColumn("market_cap");
      // @ts-expect-error accessing private
      expect(scanner._extraColumns).toContain("market_cap");
    });

    test("Scanner _evaluateCondition and _getValue branches", () => {
      const scanner = new TechnicalScanner();
      const data = { rsi: 30, close: 100, volume: 1000000, sma_50: 90 };

      // Operators
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

      // _getValue suffixes
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
      // Not running to avoid massive history mock, just check logic
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

      // Test message parser with heartbeat
      internalStream._parseMessage("~h~123");

      // Test message parser with malformed JSON
      internalStream._parseMessage("~m~10~m~{invalid}");

      // Test packet handler with quote data
      internalStream._handlePacket({
        m: "qsd",
        p: ["session", { n: "BIST:THYAO", v: { lp: 100, ch: 1, chp: 1 } }],
      });
      expect(stream.getQuote("THYAO")).toBeDefined();
    });

    test("StudySession methods", async () => {
      const stream = new TradingViewStream();
      const session = new StudySession(stream);

      // handleData with empty study map
      session.handleData("st1", { st: [] });

      // _buildTvInputs with various types
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
      // downloads with empty/force error if possible
      const results = await download(["INVALID!!"], { period: "1d" });
      expect(results).toEqual({});
    });

    test(
      "download method with multiple symbols and grouping",
      resilientTest(async () => {
        // Just checking it doesn't crash
        const results = await download(["THYAO", "ASELS"], {
          groupBy: "ticker",
        });
        expect(results).toBeDefined();
      }, 1),
    );
  });

  describe("TVScreenerProvider Coverage", () => {
    const screener = getTVScreenerProvider();

    test("Column mapping with dynamic indicators", () => {
      expect(screener.getTVColumn("sma_50")).toBe("SMA50");
      expect(screener.getTVColumn("ema_21")).toBe("EMA21");
      expect(screener.getTVColumn("rsi_14")).toBe("RSI");
      expect(screener.getTVColumn("rsi_7")).toBe("RSI7");
      expect(screener.getTVColumn("custom_field")).toBe("custom_field");

      // Interval suffix
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

    test(
      "scan method edge cases",
      resilientTest(async () => {
        await expect(
          screener.scan({ symbols: [], conditions: ["close > 0"] }),
        ).resolves.toEqual([]);
        await expect(
          screener.scan({ symbols: ["THYAO"], conditions: [] }),
        ).resolves.toEqual([]);

        // Local only should resolve successfully
        const localResult = await screener.scan({
          symbols: ["THYAO"],
          conditions: ["supertrend > 0"],
        });
        expect(Array.isArray(localResult)).toBe(true);
      }, 1),
    );

    test("separateConditions logic", () => {
      const sep = screener.separateConditions(["close > 0", "supertrend > 10"]);
      expect(sep.api).toContain("close > 0");
      expect(sep.local).toContain("supertrend > 10");
    });
  });

  describe("TEFASProvider Coverage", () => {
    const tefas = getTEFASProvider();

    test("Date formatting helpers", () => {
      const date = new Date(Date.UTC(2023, 0, 1, 12, 0, 0)); // Noon UTC to avoid TZ flips
      const internalTefas = tefas as unknown as {
        _formatDateISO: (d: Date) => string;
        _formatDateCompact: (d: Date) => string;
      };
      expect(internalTefas._formatDateISO(date)).toBe("2023-01-01");
      expect(internalTefas._formatDateCompact(date)).toBe("20230101");
    });

    test(
      "getHistory with various periods",
      resilientTest(async () => {
        // Tests period mapping
        const h1 = await tefas.getHistory({ fundCode: "TAU", period: "1wk" }); // Mapping default
        expect(Array.isArray(h1)).toBe(true);

        const h2 = await tefas.getHistory({ fundCode: "TAU", period: "6mo" }); // Mapping 90+ days
        expect(Array.isArray(h2)).toBe(true);
      }),
    );

    test(
      "getAllocationHistory convenience method",
      resilientTest(async () => {
        const alloc = await tefas.getAllocationHistory({
          fundCode: "TAU",
          period: "1mo",
        });
        expect(Array.isArray(alloc)).toBe(true);
      }),
    );

    test(
      "search method logic",
      resilientTest(async () => {
        const results = await tefas.search("TE1", 5);
        expect(Array.isArray(results)).toBe(true);
      }),
    );
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

      // Heartbeat
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

    test(
      "Search convenience methods",
      resilientTest(async () => {
        // These hit the search method with different params
        const bist = await provider.searchBist("THYAO", 5);
        expect(Array.isArray(bist)).toBe(true);

        const crypto = await provider.searchCrypto("BTC", 5);
        expect(Array.isArray(crypto)).toBe(true);

        const forex = await provider.searchForex("USDTRY", 5);
        expect(Array.isArray(forex)).toBe(true);

        const viop = await provider.searchViop("XU030", 5);
        expect(Array.isArray(viop)).toBe(true);
      }, 1),
    );

    test("monthCodeToName mapping", () => {
      expect(TradingViewSearchProvider.monthCodeToName("F")).toBe("January");
      expect(TradingViewSearchProvider.monthCodeToName("Z")).toBe("December");
      expect(TradingViewSearchProvider.monthCodeToName("INVALID")).toBe("");
    });

    test(
      "getVIOPContracts should handle searches",
      resilientTest(async () => {
        const contracts = await provider.getVIOPContracts("THYAO");
        expect(Array.isArray(contracts)).toBe(true);
      }, 1),
    );

    test("search with empty query should return empty array", async () => {
      const result = await provider.search("   ");
      expect(result).toEqual([]);
    });

    test(
      "search with assetType and exchange mapping",
      resilientTest(async () => {
        const result = await provider.search("THYAO", "stock", "bist", 1);
        expect(Array.isArray(result)).toBe(true);
      }, 1),
    );
  });
});
