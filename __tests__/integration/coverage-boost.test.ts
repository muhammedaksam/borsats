import {
  backtest,
  BacktestEngine,
  Candle,
  Position,
  StrategyFunc,
} from "~/backtest";
import { Index } from "~/bist-index";
import { Eurobond } from "~/eurobond";
import { FX } from "~/fx";
import { Inflation } from "~/inflation";
import { download } from "~/multi";
import { getTEFASProvider } from "~/providers/tefas";
import { getTVScreenerProvider } from "~/providers/tradingview-screener-native";
import {
  getSearchProvider,
  TradingViewSearchProvider,
} from "~/providers/tradingview-search";
import { resilientTest } from "../helpers/network-utils";

describe("Coverage Boost Tests (Integration)", () => {
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

  describe("Multi Tickers Coverage", () => {
    test(
      "download method with multiple symbols and grouping",
      resilientTest(async () => {
        const results = await download(["THYAO", "ASELS"], {
          groupBy: "ticker",
        });
        expect(results).toBeDefined();
      }, 1),
    );
  });

  describe("TVScreenerProvider Coverage", () => {
    const screener = getTVScreenerProvider();

    test(
      "scan method edge cases",
      resilientTest(async () => {
        await expect(
          screener.scan({ symbols: [], conditions: ["close > 0"] }),
        ).resolves.toEqual([]);
        await expect(
          screener.scan({ symbols: ["THYAO"], conditions: [] }),
        ).resolves.toEqual([]);

        const localResult = await screener.scan({
          symbols: ["THYAO"],
          conditions: ["supertrend > 0"],
        });
        expect(Array.isArray(localResult)).toBe(true);
      }, 1),
    );
  });

  describe("TEFASProvider Coverage", () => {
    const tefas = getTEFASProvider();

    test(
      "getHistory with various periods",
      resilientTest(async () => {
        const h1 = await tefas.getHistory({ fundCode: "TAU", period: "1wk" });
        expect(Array.isArray(h1)).toBe(true);

        const h2 = await tefas.getHistory({ fundCode: "TAU", period: "6mo" });
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

  describe("TradingViewSearchProvider Coverage", () => {
    let provider: TradingViewSearchProvider;

    beforeAll(() => {
      provider = getSearchProvider();
    });

    test(
      "Search convenience methods",
      resilientTest(async () => {
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

    test(
      "getVIOPContracts should handle searches",
      resilientTest(async () => {
        const contracts = await provider.getVIOPContracts("THYAO");
        expect(Array.isArray(contracts)).toBe(true);
      }, 1),
    );

    test(
      "search with assetType and exchange mapping",
      resilientTest(async () => {
        const result = await provider.search("THYAO", "stock", "bist", 1);
        expect(Array.isArray(result)).toBe(true);
      }, 1),
    );
  });
});
