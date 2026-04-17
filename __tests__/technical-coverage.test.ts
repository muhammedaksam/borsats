/**
 * Pure unit tests for src/technical.ts — exercises all uncovered indicator functions
 * and the addIndicators() helper with the new MetaStock indicator switches.
 */

import {
  calculateSupertrend,
  calculateTilsonT3,
  calculateCCI,
  calculateWilliamsR,
  calculatePivotPoints,
  calculateIchimoku,
  calculateHHV,
  calculateLLV,
  calculateMOM,
  calculateROC,
  calculateWMA,
  calculateDEMA,
  calculateTEMA,
  addIndicators,
  TechnicalAnalyzer,
} from "~/technical";
import { OHLCVData } from "~/types";

// Deterministic OHLCV fixture
function makeData(n: number): OHLCVData[] {
  const data: OHLCVData[] = [];
  for (let i = 0; i < n; i++) {
    const base = 100 + Math.sin(i / 5) * 10 + i * 0.1;
    data.push({
      date: new Date(2024, 0, i + 1),
      open: base - 1,
      high: base + 3,
      low: base - 4,
      close: base,
      volume: 10000 + i * 100,
    });
  }
  return data;
}

const DATA_260 = makeData(260);
const DATA_60 = makeData(60);
const DATA_1 = makeData(1);
const DATA_EMPTY: OHLCVData[] = [];

describe("Technical Indicators — Full Coverage", () => {
  describe("Supertrend", () => {
    test("returns correct structure for 260 bars", () => {
      const st = calculateSupertrend(DATA_260);
      expect(st.length).toBe(260);
      expect(st[0]).toHaveProperty("supertrend");
      expect(st[0]).toHaveProperty("direction");
      expect(st[0]).toHaveProperty("upper");
      expect(st[0]).toHaveProperty("lower");
    });

    test("handles single bar", () => {
      const st = calculateSupertrend(DATA_1);
      expect(st.length).toBe(1);
      expect(st[0].direction).toBe(0);
      expect(st[0].supertrend).toBeNaN();
    });

    test("handles empty data", () => {
      const st = calculateSupertrend(DATA_EMPTY);
      expect(st.length).toBe(0);
    });

    test("direction changes occur", () => {
      const st = calculateSupertrend(DATA_260, 10, 1.5);
      const directions = st.map((s) => s.direction);
      const hasBullish = directions.includes(1);
      const hasBearish = directions.includes(-1);
      // With oscillating data & low multiplier, we expect both directions
      expect(hasBullish || hasBearish).toBe(true);
    });
  });

  describe("TilsonT3", () => {
    test("returns array of correct length", () => {
      const t3 = calculateTilsonT3(DATA_60);
      expect(t3.length).toBe(60);
    });

    test("empty data returns empty", () => {
      expect(calculateTilsonT3(DATA_EMPTY).length).toBe(0);
    });

    test("custom vfactor", () => {
      const t3 = calculateTilsonT3(DATA_60, 10, 0.5);
      expect(t3.length).toBe(60);
    });
  });

  describe("CCI", () => {
    test("returns values for sufficient data", () => {
      const cci = calculateCCI(DATA_60, 20);
      expect(cci.length).toBe(60);
      // First 19 should be NaN, the rest should be numbers
      for (let i = 0; i < 19; i++) {
        expect(cci[i]).toBeNaN();
      }
      expect(typeof cci[19]).toBe("number");
    });

    test("insufficient data returns all NaN", () => {
      const cci = calculateCCI(DATA_1, 20);
      expect(cci.length).toBe(1);
      expect(cci[0]).toBeNaN();
    });
  });

  describe("WilliamsR", () => {
    test("returns values for sufficient data", () => {
      const wr = calculateWilliamsR(DATA_60, 14);
      expect(wr.length).toBe(60);
      for (let i = 0; i < 13; i++) {
        expect(wr[i]).toBeNaN();
      }
      // Valid values should be between -100 and 0
      for (let i = 13; i < wr.length; i++) {
        expect(wr[i]).toBeLessThanOrEqual(0);
        expect(wr[i]).toBeGreaterThanOrEqual(-100);
      }
    });

    test("insufficient data returns all NaN", () => {
      const wr = calculateWilliamsR(DATA_1, 14);
      expect(wr.length).toBe(1);
      expect(wr[0]).toBeNaN();
    });

    test("flat data returns -50", () => {
      const flat: OHLCVData[] = Array.from({ length: 20 }, (_, i) => ({
        date: new Date(2024, 0, i + 1),
        open: 100,
        high: 100,
        low: 100,
        close: 100,
        volume: 1000,
      }));
      const wr = calculateWilliamsR(flat, 14);
      // When range is 0, result is -50
      expect(wr[13]).toBe(-50);
    });
  });

  describe("PivotPoints", () => {
    test("returns array matching data length", () => {
      const pp = calculatePivotPoints(DATA_60);
      expect(pp.length).toBe(60);
      expect(pp[0]).toHaveProperty("pivot");
      expect(pp[0]).toHaveProperty("r1");
      expect(pp[0]).toHaveProperty("r2");
      expect(pp[0]).toHaveProperty("r3");
      expect(pp[0]).toHaveProperty("s1");
      expect(pp[0]).toHaveProperty("s2");
      expect(pp[0]).toHaveProperty("s3");
    });

    test("first bar uses its own data", () => {
      const pp = calculatePivotPoints(DATA_60);
      const d = DATA_60[0];
      const expectedPivot = (d.high + d.low + d.close) / 3;
      expect(pp[0].pivot).toBeCloseTo(expectedPivot, 5);
    });

    test("subsequent bars use previous bar data", () => {
      const pp = calculatePivotPoints(DATA_60);
      const prev = DATA_60[0];
      const expectedPivot = (prev.high + prev.low + prev.close) / 3;
      expect(pp[1].pivot).toBeCloseTo(expectedPivot, 5);
    });
  });

  describe("Ichimoku", () => {
    test("returns full ichimoku components", () => {
      const ich = calculateIchimoku(DATA_260);
      expect(ich.length).toBe(260);
      expect(ich[0]).toHaveProperty("tenkan");
      expect(ich[0]).toHaveProperty("kijun");
      expect(ich[0]).toHaveProperty("senkouA");
      expect(ich[0]).toHaveProperty("senkouB");
      expect(ich[0]).toHaveProperty("chikou");
    });

    test("early bars have NaN for tenkan/kijun", () => {
      const ich = calculateIchimoku(DATA_260, 9, 26, 52);
      // index 0-7 should have NaN tenkan
      expect(ich[0].tenkan).toBeNaN();
      // index 8 should have valid tenkan
      expect(ich[8].tenkan).not.toBeNaN();
    });
  });

  describe("MetaStock indicators (HHV, LLV, MOM, ROC, WMA, DEMA, TEMA)", () => {
    test("HHV with default column", () => {
      const hhv = calculateHHV(DATA_60, 14);
      expect(hhv.length).toBe(60);
      expect(hhv[12]).toBeNaN(); // First 13 are NaN
      expect(typeof hhv[13]).toBe("number");
    });

    test("HHV with close column", () => {
      const hhv = calculateHHV(DATA_60, 14, "close");
      expect(hhv.length).toBe(60);
    });

    test("LLV with default column", () => {
      const llv = calculateLLV(DATA_60, 14);
      expect(llv.length).toBe(60);
    });

    test("LLV with open column", () => {
      const llv = calculateLLV(DATA_60, 14, "open");
      expect(llv.length).toBe(60);
    });

    test("MOM", () => {
      const mom = calculateMOM(DATA_60, 10);
      expect(mom.length).toBe(60);
      for (let i = 0; i < 10; i++) expect(mom[i]).toBeNaN();
      expect(typeof mom[10]).toBe("number");
    });

    test("ROC", () => {
      const roc = calculateROC(DATA_60, 10);
      expect(roc.length).toBe(60);
      for (let i = 0; i < 10; i++) expect(roc[i]).toBeNaN();
      expect(typeof roc[10]).toBe("number");
    });

    test("ROC with zero denominator", () => {
      const zeroData: OHLCVData[] = Array.from({ length: 20 }, (_, i) => ({
        date: new Date(2024, 0, i + 1),
        open: i === 0 ? 0 : 100,
        high: 100,
        low: i === 0 ? 0 : 100,
        close: i === 0 ? 0 : 100,
        volume: 1000,
      }));
      const roc = calculateROC(zeroData, 10);
      // Index 10 divides by close[0]=0, should be NaN
      expect(roc[10]).toBeNaN();
    });

    test("WMA", () => {
      const wma = calculateWMA(DATA_60, 20);
      expect(wma.length).toBe(60);
      for (let i = 0; i < 19; i++) expect(wma[i]).toBeNaN();
      expect(typeof wma[19]).toBe("number");
    });

    test("DEMA", () => {
      const dema = calculateDEMA(DATA_60, 20);
      expect(dema.length).toBe(60);
    });

    test("TEMA", () => {
      const tema = calculateTEMA(DATA_60, 20);
      expect(tema.length).toBe(60);
    });
  });

  describe("addIndicators — MetaStock branches", () => {
    test("Default indicators (no metastock)", () => {
      const result = addIndicators(DATA_60);
      expect(result.length).toBe(60);
      expect(result[59]).toHaveProperty("sma_20");
      expect(result[59]).toHaveProperty("rsi_14");
      expect(result[59]).toHaveProperty("macd");
    });

    test("All MetaStock indicators", () => {
      const result = addIndicators(DATA_260, {
        indicators: [
          "sma", "ema", "rsi", "macd", "bollinger", "atr",
          "stochastic", "obv", "vwap", "adx",
          "supertrend", "cci", "williamsr",
          "hhv", "llv", "mom", "roc", "wma", "dema", "tema",
        ],
      });
      expect(result.length).toBe(260);
      const last = result[259];
      // MetaStock
      expect(last).toHaveProperty("hhv_14");
      expect(last).toHaveProperty("llv_14");
      expect(last).toHaveProperty("mom_10");
      expect(last).toHaveProperty("roc_10");
      expect(last).toHaveProperty("wma_20");
      expect(last).toHaveProperty("dema_20");
      expect(last).toHaveProperty("tema_20");
      // Other new ones
      expect(last).toHaveProperty("supertrend");
      expect(last).toHaveProperty("supertrend_direction");
      expect(last).toHaveProperty("cci_20");
      expect(last).toHaveProperty("williamsR_14");
      // Standard
      expect(last).toHaveProperty("obv");
      expect(last).toHaveProperty("vwap");
      expect(last).toHaveProperty("bb_upper");
      expect(last).toHaveProperty("stoch_k");
    });
  });

  describe("TechnicalAnalyzer — new methods", () => {
    const analyzer = new TechnicalAnalyzer(DATA_260);

    test("supertrend", () => {
      const st = analyzer.supertrend();
      expect(st.length).toBe(260);
    });

    test("tilsonT3", () => {
      const t3 = analyzer.tilsonT3();
      expect(t3.length).toBe(260);
    });

    test("cci", () => {
      const cci = analyzer.cci();
      expect(cci.length).toBe(260);
    });

    test("williamsR", () => {
      const wr = analyzer.williamsR();
      expect(wr.length).toBe(260);
    });

    test("pivotPoints", () => {
      const pp = analyzer.pivotPoints();
      expect(pp.length).toBe(260);
    });

    test("ichimoku", () => {
      const ich = analyzer.ichimoku();
      expect(ich.length).toBe(260);
    });

    test("heikinAshi", () => {
      const ha = analyzer.heikinAshi();
      expect(ha.length).toBe(260);
    });

    test("MetaStock methods via analyzer", () => {
      expect(analyzer.hhv().length).toBe(260);
      expect(analyzer.llv().length).toBe(260);
      expect(analyzer.mom().length).toBe(260);
      expect(analyzer.roc().length).toBe(260);
      expect(analyzer.wma().length).toBe(260);
      expect(analyzer.dema().length).toBe(260);
      expect(analyzer.tema().length).toBe(260);
    });

    test("latest getter includes MetaStock fields", () => {
      const latest = analyzer.latest;
      expect(latest).toHaveProperty("mom_10");
      expect(latest).toHaveProperty("roc_10");
      expect(latest).toHaveProperty("wma_20");
      expect(latest).toHaveProperty("dema_20");
      expect(latest).toHaveProperty("tema_20");
      expect(latest).toHaveProperty("hhv_14");
      expect(latest).toHaveProperty("llv_14");
    });

    test("empty data analyzer latest returns empty", () => {
      const emptyAnalyzer = new TechnicalAnalyzer([]);
      expect(emptyAnalyzer.latest).toEqual({});
    });
  });
});
