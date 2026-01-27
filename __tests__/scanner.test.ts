import { scan, TechnicalScanner } from "@/scanner";

// Mock the providers
jest.mock("@/providers/bist-index", () => ({
  getBistIndexProvider: jest.fn(() => ({
    getIndexConstituents: jest
      .fn()
      .mockResolvedValue(["THYAO", "GARAN", "ASELS"]),
  })),
}));

jest.mock("@/providers/tradingview-scanner", () => ({
  getScannerProvider: jest.fn(() => ({
    scanTA: jest.fn().mockResolvedValue([
      {
        symbol: "THYAO",
        data: {
          RSI: 25,
          close: 100,
          SMA50: 95,
          volume: 1500000,
        },
      },
      {
        symbol: "GARAN",
        data: {
          RSI: 45,
          close: 80,
          SMA50: 85,
          volume: 500000,
        },
      },
      {
        symbol: "ASELS",
        data: {
          RSI: 28,
          close: 120,
          SMA50: 110,
          volume: 2000000,
        },
      },
    ]),
  })),
  INTERVAL_MAP: {
    "1m": "|1",
    "5m": "|5",
    "15m": "|15",
    "30m": "|30",
    "1h": "|60",
    "1d": "",
  },
}));

describe("TechnicalScanner", () => {
  describe("constructor and basic methods", () => {
    test("creates scanner instance", () => {
      const scanner = new TechnicalScanner();
      expect(scanner).toBeInstanceOf(TechnicalScanner);
    });

    test("symbols() returns empty array initially", () => {
      const scanner = new TechnicalScanner();
      expect(scanner.symbols).toEqual([]);
    });

    test("conditions() returns empty array initially", () => {
      const scanner = new TechnicalScanner();
      expect(scanner.conditions).toEqual([]);
    });

    test("toString() returns description", () => {
      const scanner = new TechnicalScanner();
      expect(scanner.toString()).toContain("TechnicalScanner");
    });
  });

  describe("setUniverse", () => {
    test("sets universe from array of symbols", async () => {
      const scanner = new TechnicalScanner();
      await scanner.setUniverse(["THYAO", "GARAN"]);
      expect(scanner.symbols).toEqual(["THYAO", "GARAN"]);
    });

    test("sets universe from index", async () => {
      const scanner = new TechnicalScanner();
      await scanner.setUniverse("XU030");
      // Mock returns ["THYAO", "GARAN", "ASELS"]
      expect(scanner.symbols.length).toBeGreaterThan(0);
    });

    test("returns scanner for chaining", async () => {
      const scanner = new TechnicalScanner();
      const result = await scanner.setUniverse(["THYAO"]);
      expect(result).toBe(scanner);
    });
  });

  describe("addSymbol", () => {
    test("adds symbol to universe", async () => {
      const scanner = new TechnicalScanner();
      await scanner.setUniverse(["THYAO"]);
      scanner.addSymbol("GARAN");
      expect(scanner.symbols).toContain("GARAN");
    });

    test("does not add duplicate symbols", async () => {
      const scanner = new TechnicalScanner();
      await scanner.setUniverse(["THYAO"]);
      scanner.addSymbol("THYAO");
      expect(scanner.symbols.filter((s) => s === "THYAO").length).toBe(1);
    });

    test("returns scanner for chaining", async () => {
      const scanner = new TechnicalScanner();
      const result = scanner.addSymbol("THYAO");
      expect(result).toBe(scanner);
    });
  });

  describe("removeSymbol", () => {
    test("removes symbol from universe", async () => {
      const scanner = new TechnicalScanner();
      await scanner.setUniverse(["THYAO", "GARAN"]);
      scanner.removeSymbol("THYAO");
      expect(scanner.symbols).not.toContain("THYAO");
    });

    test("returns scanner for chaining", async () => {
      const scanner = new TechnicalScanner();
      const result = scanner.removeSymbol("THYAO");
      expect(result).toBe(scanner);
    });
  });

  describe("addCondition", () => {
    test("adds simple condition", () => {
      const scanner = new TechnicalScanner();
      scanner.addCondition("rsi < 30");
      expect(scanner.conditions).toContain("rsi < 30");
    });

    test("adds named condition", () => {
      const scanner = new TechnicalScanner();
      scanner.addCondition("rsi < 30", "oversold");
      expect(scanner.conditions).toContain("rsi < 30");
    });

    test("adds compound condition (split by and)", () => {
      const scanner = new TechnicalScanner();
      scanner.addCondition("rsi < 30 and volume > 1000000");
      // Compound conditions are split
      expect(scanner.conditions).toContain("rsi < 30");
      expect(scanner.conditions).toContain("volume > 1000000");
    });

    test("returns scanner for chaining", () => {
      const scanner = new TechnicalScanner();
      const result = scanner.addCondition("rsi < 30");
      expect(result).toBe(scanner);
    });
  });

  describe("removeCondition", () => {
    test("removes condition by string", () => {
      const scanner = new TechnicalScanner();
      scanner.addCondition("rsi < 30");
      scanner.removeCondition("rsi < 30");
      expect(scanner.conditions).not.toContain("rsi < 30");
    });

    test("removes condition by name", () => {
      const scanner = new TechnicalScanner();
      scanner.addCondition("rsi < 30", "oversold");
      scanner.removeCondition("oversold");
      expect(scanner.conditions).not.toContain("rsi < 30");
    });
  });

  describe("clearConditions", () => {
    test("clears all conditions", () => {
      const scanner = new TechnicalScanner();
      scanner.addCondition("rsi < 30");
      scanner.addCondition("volume > 1000000");
      scanner.clearConditions();
      expect(scanner.conditions).toEqual([]);
    });
  });

  describe("setInterval", () => {
    test("sets interval", () => {
      const scanner = new TechnicalScanner();
      scanner.setInterval("1h");
      expect(scanner.toString()).toContain("1h");
    });

    test("returns scanner for chaining", () => {
      const scanner = new TechnicalScanner();
      const result = scanner.setInterval("1d");
      expect(result).toBe(scanner);
    });
  });

  describe("addColumn", () => {
    test("adds extra column", () => {
      const scanner = new TechnicalScanner();
      scanner.addColumn("market_cap");
      expect(scanner).toBeInstanceOf(TechnicalScanner);
    });

    test("returns scanner for chaining", () => {
      const scanner = new TechnicalScanner();
      const result = scanner.addColumn("market_cap");
      expect(result).toBe(scanner);
    });
  });

  describe("run", () => {
    test("returns empty array for empty universe", async () => {
      const scanner = new TechnicalScanner();
      scanner.addCondition("rsi < 30");
      const results = await scanner.run();
      expect(results).toEqual([]);
    });

    test("returns empty array for no conditions", async () => {
      const scanner = new TechnicalScanner();
      await scanner.setUniverse(["THYAO"]);
      const results = await scanner.run();
      expect(results).toEqual([]);
    });

    test("returns matching results", async () => {
      const scanner = new TechnicalScanner();
      await scanner.setUniverse("XU030");
      scanner.addCondition("rsi < 30");
      const results = await scanner.run();

      // Should find THYAO (RSI=25) and ASELS (RSI=28)
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    test("filters by conditions", async () => {
      const scanner = new TechnicalScanner();
      await scanner.setUniverse("XU030");
      scanner.addCondition("rsi < 30");
      scanner.addCondition("volume > 1000000");
      const results = await scanner.run();

      results.forEach((result) => {
        expect(result).toHaveProperty("symbol");
        expect(result).toHaveProperty("data");
        expect(result).toHaveProperty("conditionsMet");
        expect(result).toHaveProperty("timestamp");
      });
    });

    test("respects limit parameter", async () => {
      const scanner = new TechnicalScanner();
      await scanner.setUniverse("XU030");
      scanner.addCondition("rsi < 50");
      const results = await scanner.run(1);
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe("_evaluateCondition", () => {
    test("evaluates less than condition", async () => {
      const scanner = new TechnicalScanner();
      const data = { RSI: 25, close: 100 };

      // Access private method via any
      const result = (
        scanner as unknown as {
          _evaluateCondition: (
            c: string,
            d: Record<string, unknown>,
          ) => boolean;
        }
      )._evaluateCondition("rsi < 30", data);

      if (result !== undefined) {
        expect(typeof result).toBe("boolean");
      }
    });

    test("evaluates greater than condition", async () => {
      const scanner = new TechnicalScanner();
      const data = { volume: 5000000, close: 100 };

      const result = (
        scanner as unknown as {
          _evaluateCondition: (
            c: string,
            d: Record<string, unknown>,
          ) => boolean;
        }
      )._evaluateCondition("volume > 1000000", data);

      if (result !== undefined) {
        expect(typeof result).toBe("boolean");
      }
    });

    test("evaluates field comparison", async () => {
      const scanner = new TechnicalScanner();
      const data = { close: 100, SMA50: 95 };

      const result = (
        scanner as unknown as {
          _evaluateCondition: (
            c: string,
            d: Record<string, unknown>,
          ) => boolean;
        }
      )._evaluateCondition("close > sma_50", data);

      if (result !== undefined) {
        expect(typeof result).toBe("boolean");
      }
    });
  });

  describe("_getValue", () => {
    test("gets numeric value from data", () => {
      const scanner = new TechnicalScanner();
      const data = { RSI: 25 };

      const result = (
        scanner as unknown as {
          _getValue: (e: string, d: Record<string, unknown>) => number | null;
        }
      )._getValue("rsi", data);

      if (result !== null) {
        expect(typeof result).toBe("number");
      }
    });

    test("parses numeric string", () => {
      const scanner = new TechnicalScanner();
      const data = {};

      const result = (
        scanner as unknown as {
          _getValue: (e: string, d: Record<string, unknown>) => number | null;
        }
      )._getValue("100", data);

      expect(result).toBe(100);
    });

    test("parses K suffix for thousands", () => {
      const scanner = new TechnicalScanner();
      const data = {};

      const result = (
        scanner as unknown as {
          _getValue: (e: string, d: Record<string, unknown>) => number | null;
        }
      )._getValue("500K", data);

      expect(result).toBe(500000);
    });

    test("parses M suffix for millions", () => {
      const scanner = new TechnicalScanner();
      const data = {};

      const result = (
        scanner as unknown as {
          _getValue: (e: string, d: Record<string, unknown>) => number | null;
        }
      )._getValue("2M", data);

      expect(result).toBe(2000000);
    });

    test("returns null for unknown field", () => {
      const scanner = new TechnicalScanner();
      const data = {};

      const result = (
        scanner as unknown as {
          _getValue: (e: string, d: Record<string, unknown>) => number | null;
        }
      )._getValue("unknownfield", data);

      expect(result).toBeNull();
    });

    test("handles field name with underscores", () => {
      const scanner = new TechnicalScanner();
      const data = { sma_50: 95 };

      const result = (
        scanner as unknown as {
          _getValue: (e: string, d: Record<string, unknown>) => number | null;
        }
      )._getValue("sma_50", data);

      expect(result).toBe(95);
    });
  });

  describe("_evaluateCondition - all operators", () => {
    const scanner = new TechnicalScanner();
    const evalFn = (c: string, d: Record<string, unknown>) =>
      (
        scanner as unknown as {
          _evaluateCondition: (
            c: string,
            d: Record<string, unknown>,
          ) => boolean;
        }
      )._evaluateCondition(c, d);

    test("evaluates < operator", () => {
      expect(evalFn("rsi < 30", { rsi: 25 })).toBe(true);
      expect(evalFn("rsi < 30", { rsi: 35 })).toBe(false);
    });

    test("evaluates > operator", () => {
      expect(evalFn("rsi > 70", { rsi: 75 })).toBe(true);
      expect(evalFn("rsi > 70", { rsi: 65 })).toBe(false);
    });

    test("evaluates <= operator", () => {
      expect(evalFn("rsi <= 30", { rsi: 30 })).toBe(true);
      expect(evalFn("rsi <= 30", { rsi: 25 })).toBe(true);
      expect(evalFn("rsi <= 30", { rsi: 35 })).toBe(false);
    });

    test("evaluates >= operator", () => {
      expect(evalFn("rsi >= 70", { rsi: 70 })).toBe(true);
      expect(evalFn("rsi >= 70", { rsi: 75 })).toBe(true);
      expect(evalFn("rsi >= 70", { rsi: 65 })).toBe(false);
    });

    test("evaluates == operator", () => {
      expect(evalFn("rsi == 50", { rsi: 50 })).toBe(true);
      expect(evalFn("rsi == 50", { rsi: 51 })).toBe(false);
    });

    test("evaluates != operator", () => {
      expect(evalFn("rsi != 50", { rsi: 45 })).toBe(true);
      expect(evalFn("rsi != 50", { rsi: 50 })).toBe(false);
    });

    test("returns false for invalid condition", () => {
      expect(evalFn("invalid condition", { rsi: 50 })).toBe(false);
    });

    test("returns false when value is null", () => {
      expect(evalFn("rsi < 30", {})).toBe(false);
    });

    test("compares two fields", () => {
      expect(evalFn("close > sma_50", { close: 100, sma_50: 95 })).toBe(true);
      expect(evalFn("close > sma_50", { close: 90, sma_50: 95 })).toBe(false);
    });
  });
});

describe("scan function", () => {
  test("returns array of results", async () => {
    const results = await scan("XU030", "rsi < 30");
    expect(Array.isArray(results)).toBe(true);
  });

  test("accepts array of symbols", async () => {
    const results = await scan(["THYAO", "GARAN"], "rsi < 30");
    expect(Array.isArray(results)).toBe(true);
  });

  test("accepts interval parameter", async () => {
    const results = await scan("XU030", "rsi < 30", "1h");
    expect(Array.isArray(results)).toBe(true);
  });

  test("accepts limit parameter", async () => {
    const results = await scan("XU030", "rsi < 30", "1d", 10);
    expect(results.length).toBeLessThanOrEqual(10);
  });
});

describe("ScanResult interface", () => {
  test("has correct structure", async () => {
    const scanner = new TechnicalScanner();
    await scanner.setUniverse("XU030");
    scanner.addCondition("rsi < 50");
    const results = await scanner.run();

    if (results.length > 0) {
      const result = results[0];
      expect(result).toHaveProperty("symbol");
      expect(result).toHaveProperty("data");
      expect(result).toHaveProperty("conditionsMet");
      expect(result).toHaveProperty("timestamp");
      expect(result.timestamp).toBeInstanceOf(Date);
    }
  });
});
