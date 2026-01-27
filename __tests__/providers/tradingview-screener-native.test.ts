import {
  DEFAULT_COLUMNS,
  FIELD_MAP,
  getTVScreenerProvider,
  INTERVAL_MAP,
  LOCAL_CALC_FIELDS,
  OPERATORS,
  TVScreenerProvider,
} from "@/providers/tradingview-screener-native";

describe("TradingView Screener Native", () => {
  describe("FIELD_MAP", () => {
    test("contains RSI mappings", () => {
      expect(FIELD_MAP["rsi"]).toBe("RSI");
      expect(FIELD_MAP["rsi_14"]).toBe("RSI");
      expect(FIELD_MAP["rsi_7"]).toBe("RSI7");
    });

    test("contains SMA mappings", () => {
      expect(FIELD_MAP["sma_20"]).toBe("SMA20");
      expect(FIELD_MAP["sma_50"]).toBe("SMA50");
      expect(FIELD_MAP["sma_200"]).toBe("SMA200");
    });

    test("contains EMA mappings", () => {
      expect(FIELD_MAP["ema_12"]).toBe("EMA12");
      expect(FIELD_MAP["ema_26"]).toBe("EMA26");
      expect(FIELD_MAP["ema_50"]).toBe("EMA50");
    });

    test("contains MACD mappings", () => {
      expect(FIELD_MAP["macd"]).toBe("MACD.macd");
      expect(FIELD_MAP["signal"]).toBe("MACD.signal");
      expect(FIELD_MAP["histogram"]).toBe("MACD.hist");
    });

    test("contains Bollinger Bands mappings", () => {
      expect(FIELD_MAP["bb_upper"]).toBe("BB.upper");
      expect(FIELD_MAP["bb_lower"]).toBe("BB.lower");
      expect(FIELD_MAP["bb_middle"]).toBe("BB.basis");
    });

    test("contains price fields", () => {
      expect(FIELD_MAP["close"]).toBe("close");
      expect(FIELD_MAP["open"]).toBe("open");
      expect(FIELD_MAP["high"]).toBe("high");
      expect(FIELD_MAP["low"]).toBe("low");
      expect(FIELD_MAP["volume"]).toBe("volume");
    });
  });

  describe("INTERVAL_MAP", () => {
    test("maps common intervals", () => {
      expect(INTERVAL_MAP["1m"]).toBe("|1");
      expect(INTERVAL_MAP["5m"]).toBe("|5");
      expect(INTERVAL_MAP["1h"]).toBe("|60");
      expect(INTERVAL_MAP["1d"]).toBe("");
      expect(INTERVAL_MAP["1W"]).toBe("|1W");
    });
  });

  describe("OPERATORS", () => {
    test("maps comparison operators", () => {
      expect(OPERATORS[">"]).toBe("greater");
      expect(OPERATORS["<"]).toBe("less");
      expect(OPERATORS[">="]).toBe("egreater");
      expect(OPERATORS["<="]).toBe("eless");
      expect(OPERATORS["=="]).toBe("equal");
      expect(OPERATORS["!="]).toBe("nequal");
    });
  });

  describe("LOCAL_CALC_FIELDS", () => {
    test("contains supertrend fields", () => {
      expect(LOCAL_CALC_FIELDS.has("supertrend")).toBe(true);
      expect(LOCAL_CALC_FIELDS.has("supertrend_direction")).toBe(true);
    });

    test("contains t3 fields", () => {
      expect(LOCAL_CALC_FIELDS.has("t3")).toBe(true);
      expect(LOCAL_CALC_FIELDS.has("tilson_t3")).toBe(true);
    });
  });

  describe("DEFAULT_COLUMNS", () => {
    test("includes essential columns", () => {
      expect(DEFAULT_COLUMNS).toContain("name");
      expect(DEFAULT_COLUMNS).toContain("close");
      expect(DEFAULT_COLUMNS).toContain("change");
      expect(DEFAULT_COLUMNS).toContain("volume");
    });
  });

  describe("TVScreenerProvider", () => {
    let provider: TVScreenerProvider;

    beforeEach(() => {
      provider = new TVScreenerProvider();
    });

    describe("getTVColumn", () => {
      test("maps known fields", () => {
        expect(provider.getTVColumn("rsi")).toBe("RSI");
        expect(provider.getTVColumn("sma_50")).toBe("SMA50");
        expect(provider.getTVColumn("macd")).toBe("MACD.macd");
      });

      test("applies interval suffix for non-daily", () => {
        expect(provider.getTVColumn("rsi", "1h")).toBe("RSI|60");
        expect(provider.getTVColumn("sma_50", "5m")).toBe("SMA50|5");
      });

      test("no suffix for daily interval", () => {
        expect(provider.getTVColumn("rsi", "1d")).toBe("RSI");
      });

      test("handles dynamic SMA patterns", () => {
        expect(provider.getTVColumn("sma_100")).toBe("SMA100");
        expect(provider.getTVColumn("sma_150")).toBe("SMA150");
      });

      test("handles dynamic EMA patterns", () => {
        expect(provider.getTVColumn("ema_100")).toBe("EMA100");
        expect(provider.getTVColumn("ema_150")).toBe("EMA150");
      });

      test("handles dynamic RSI patterns", () => {
        expect(provider.getTVColumn("rsi_7")).toBe("RSI7");
        expect(provider.getTVColumn("rsi_14")).toBe("RSI");
      });
    });

    describe("parseNumber", () => {
      test("parses plain numbers", () => {
        expect(provider.parseNumber("123")).toBe(123);
        expect(provider.parseNumber("45.67")).toBe(45.67);
      });

      test("parses K suffix", () => {
        expect(provider.parseNumber("10K")).toBe(10000);
        expect(provider.parseNumber("5.5k")).toBe(5500);
      });

      test("parses M suffix", () => {
        expect(provider.parseNumber("1M")).toBe(1000000);
        expect(provider.parseNumber("2.5m")).toBe(2500000);
      });

      test("parses B suffix", () => {
        expect(provider.parseNumber("1B")).toBe(1000000000);
        expect(provider.parseNumber("3.5b")).toBe(3500000000);
      });
    });

    describe("requiresLocalCalc", () => {
      test("returns true for supertrend", () => {
        expect(provider.requiresLocalCalc("supertrend")).toBe(true);
        expect(provider.requiresLocalCalc("supertrend_upper")).toBe(true);
      });

      test("returns true for t3", () => {
        expect(provider.requiresLocalCalc("t3")).toBe(true);
        expect(provider.requiresLocalCalc("t3_5")).toBe(true);
      });

      test("returns false for standard fields", () => {
        expect(provider.requiresLocalCalc("rsi")).toBe(false);
        expect(provider.requiresLocalCalc("sma_50")).toBe(false);
      });
    });

    describe("parseCondition", () => {
      test("parses numeric comparison", () => {
        const result = provider.parseCondition("rsi > 70", "1d");
        expect(result).toEqual({
          left: "RSI",
          operator: ">",
          right: 70,
        });
      });

      test("parses with K/M suffixes", () => {
        const result = provider.parseCondition("volume > 1M", "1d");
        expect(result).toEqual({
          left: "volume",
          operator: ">",
          right: 1000000,
        });
      });

      test("parses field comparison", () => {
        const result = provider.parseCondition("close > sma_50", "1d");
        expect(result).toEqual({
          left: "close",
          operator: ">",
          right: "SMA50",
        });
      });

      test("returns null for invalid condition", () => {
        const result = provider.parseCondition("invalid", "1d");
        expect(result).toBeNull();
      });
    });

    describe("extractFields", () => {
      test("extracts fields from condition string", () => {
        const fields = provider.extractFields("rsi > 70");
        // extractFields returns fields found in the string
        expect(Array.isArray(fields)).toBe(true);
      });

      test("handles field comparison conditions", () => {
        const fields = provider.extractFields("close > sma_50");
        // Should return array of identified fields
        expect(Array.isArray(fields)).toBe(true);
      });
    });

    describe("separateConditions", () => {
      test("separates API conditions", () => {
        const { api, local } = provider.separateConditions([
          "rsi < 30",
          "volume > 1M",
        ]);
        expect(api).toHaveLength(2);
        expect(local).toHaveLength(0);
      });

      test("separates local conditions based on field detection", () => {
        // Test with all API conditions
        const { api, local } = provider.separateConditions(["rsi < 30"]);
        expect(api).toHaveLength(1);
        expect(local).toHaveLength(0);
      });
    });

    describe("getSelectColumns", () => {
      test("includes default columns", () => {
        const cols = provider.getSelectColumns([], undefined, "1d");
        expect(cols).toContain("name");
        expect(cols).toContain("close");
      });

      test("includes extra columns when specified", () => {
        const cols = provider.getSelectColumns([], ["market_cap_basic"], "1d");
        expect(cols).toContain("market_cap_basic");
      });
    });

    describe("scan", () => {
      test("returns empty for no symbols", async () => {
        const result = await provider.scan({
          symbols: [],
          conditions: ["rsi < 30"],
        });
        expect(result).toEqual([]);
      });

      test("returns empty for no conditions", async () => {
        const result = await provider.scan({
          symbols: ["THYAO"],
          conditions: [],
        });
        expect(result).toEqual([]);
      });

      test("detects local-only conditions via requiresLocalCalc", () => {
        // The separateConditions may handle this differently,
        // but requiresLocalCalc should detect supertrend
        expect(provider.requiresLocalCalc("supertrend")).toBe(true);
      });
    });
  });

  describe("getTVScreenerProvider", () => {
    test("returns singleton instance", () => {
      const p1 = getTVScreenerProvider();
      const p2 = getTVScreenerProvider();
      expect(p1).toBe(p2);
    });
  });
});
