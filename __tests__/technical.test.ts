import {
  calculateADX,
  calculateATR,
  calculateBollingerBands,
  calculateCCI,
  calculateEMA,
  calculateIchimoku,
  calculateMACD,
  calculateOBV,
  calculatePivotPoints,
  calculateRSI,
  calculateSMA,
  calculateStochastic,
  calculateSupertrend,
  calculateTilsonT3,
  calculateVWAP,
  calculateWilliamsR,
  TechnicalAnalyzer,
} from "@/technical";
import { OHLCVData } from "@/types";

describe("Technical Analysis", () => {
  // Generate sample data: Upward trend
  const createData = (n: number): OHLCVData[] => {
    const data: OHLCVData[] = [];
    let price = 100;
    const now = new Date();
    for (let i = 0; i < n; i++) {
      const date = new Date(now.getTime() + i * 86400000);
      price = price + (Math.random() - 0.4) * 2; // Slight upward trend
      data.push({
        date,
        open: price,
        high: price + 1,
        low: price - 1,
        close: price + 0.5,
        volume: 1000 + Math.random() * 1000,
      });
    }
    return data;
  };

  const data = createData(50);

  test("calculateSMA", () => {
    const sma = calculateSMA(data, 10);
    expect(sma.length).toBe(50); // Same length, padded with NaN
    expect(isNaN(sma[0])).toBe(true);
    expect(isNaN(sma[8])).toBe(true);
    expect(isNaN(sma[9])).toBe(false); // 10th element (index 9) should be valid
    expect(typeof sma[49]).toBe("number");
  });

  test("calculateEMA", () => {
    const ema = calculateEMA(data, 10);
    expect(ema.length).toBe(50);
    expect(isNaN(ema[0])).toBe(false); // EMA starts immediately
    expect(typeof ema[49]).toBe("number");
  });

  test("calculateRSI", () => {
    const rsi = calculateRSI(data, 14);
    expect(rsi.length).toBe(50);
    expect(isNaN(rsi[0])).toBe(true);
    expect(typeof rsi[49]).toBe("number");

    // Check range
    const val = rsi[49];
    if (!isNaN(val)) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(100);
    }
  });

  test("calculateMACD", () => {
    const macd = calculateMACD(data);
    expect(macd.length).toBe(50);
    expect(macd[49]).toHaveProperty("macd");
    expect(macd[49]).toHaveProperty("signal");
    expect(macd[49]).toHaveProperty("histogram");
  });

  test("calculateBollingerBands", () => {
    const bb = calculateBollingerBands(data, 20);
    expect(bb.length).toBe(50);
    const last = bb[49];
    if (!isNaN(last.upper)) {
      expect(last.upper).toBeGreaterThan(last.lower);
      expect(last.middle).toBeLessThan(last.upper);
      expect(last.middle).toBeGreaterThan(last.lower);
    }
  });

  test("calculateATR", () => {
    const atr = calculateATR(data, 14);
    expect(atr.length).toBe(50);
    expect(typeof atr[49]).toBe("number");
  });

  test("calculateStochastic", () => {
    const stoch = calculateStochastic(data, 14, 3);
    expect(stoch.length).toBe(50);
    const last = stoch[49];
    if (!isNaN(last.k)) {
      expect(last.k).toBeGreaterThanOrEqual(0);
      expect(last.k).toBeLessThanOrEqual(100);
    }
  });

  test("calculateOBV", () => {
    const obv = calculateOBV(data);
    expect(obv.length).toBe(50);
    expect(typeof obv[49]).toBe("number");
  });

  test("calculateVWAP", () => {
    const vwap = calculateVWAP(data);
    expect(vwap.length).toBe(50);
    expect(typeof vwap[49]).toBe("number");
  });

  test("calculateADX", () => {
    const adx = calculateADX(data, 14);
    expect(adx.length).toBe(50);
    const val = adx[49];
    if (!isNaN(val)) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(100);
    }
  });

  test("TechnicalAnalyzer class", () => {
    const ta = new TechnicalAnalyzer(data);
    expect(ta.rsi(14).length).toBe(50);
    expect(ta.sma(20).length).toBe(50);

    const latest = ta.latest;
    expect(latest).toHaveProperty("rsi_14");
    expect(latest).toHaveProperty("sma_20");
    expect(latest).toHaveProperty("macd");
    expect(typeof latest.rsi_14).toBe("number");
  });

  test("calculateSupertrend", () => {
    const st = calculateSupertrend(data, 10, 3);
    expect(st.length).toBe(50);
    expect(st[49]).toHaveProperty("supertrend");
    expect(st[49]).toHaveProperty("direction");
    expect(st[49]).toHaveProperty("upper");
    expect(st[49]).toHaveProperty("lower");
    expect([1, -1]).toContain(st[49].direction);
    expect(typeof st[49].supertrend).toBe("number");
  });

  test("calculateTilsonT3", () => {
    const t3 = calculateTilsonT3(data, 5, 0.7);
    expect(t3.length).toBe(50);
    expect(typeof t3[49]).toBe("number");
    expect(isNaN(t3[49])).toBe(false);
  });

  test("TechnicalAnalyzer supertrend method", () => {
    const ta = new TechnicalAnalyzer(data);
    const st = ta.supertrend(10, 3);
    expect(st.length).toBe(50);
    expect(st[49]).toHaveProperty("supertrend");
  });

  test("TechnicalAnalyzer tilsonT3 method", () => {
    const ta = new TechnicalAnalyzer(data);
    const t3 = ta.tilsonT3(5, 0.7);
    expect(t3.length).toBe(50);
    expect(typeof t3[49]).toBe("number");
  });
});

describe("Technical Analysis Additional Coverage", () => {
  const createData = (n: number): OHLCVData[] => {
    const data: OHLCVData[] = [];
    let price = 100;
    const now = new Date();
    for (let i = 0; i < n; i++) {
      const date = new Date(now.getTime() + i * 86400000);
      price = price + (Math.random() - 0.4) * 2;
      data.push({
        date,
        open: price,
        high: price + 2,
        low: price - 2,
        close: price + 0.5,
        volume: 1000 + Math.random() * 1000,
      });
    }
    return data;
  };

  const data = createData(60);

  test("calculateCCI", () => {
    const cci = calculateCCI(data, 20);
    expect(cci.length).toBe(60);
    expect(isNaN(cci[0])).toBe(true);
    expect(isNaN(cci[18])).toBe(true);
    expect(isNaN(cci[19])).toBe(false);
    expect(typeof cci[59]).toBe("number");
  });

  test("calculateCCI with short data returns NaN array", () => {
    const shortData = createData(10);
    const cci = calculateCCI(shortData, 20);
    expect(cci.length).toBe(10);
    cci.forEach((v) => expect(isNaN(v)).toBe(true));
  });

  test("calculateWilliamsR", () => {
    const wr = calculateWilliamsR(data, 14);
    expect(wr.length).toBe(60);
    expect(isNaN(wr[0])).toBe(true);
    expect(isNaN(wr[12])).toBe(true);
    expect(isNaN(wr[13])).toBe(false);

    const val = wr[59];
    if (!isNaN(val)) {
      expect(val).toBeGreaterThanOrEqual(-100);
      expect(val).toBeLessThanOrEqual(0);
    }
  });

  test("calculateWilliamsR with short data returns NaN array", () => {
    const shortData = createData(5);
    const wr = calculateWilliamsR(shortData, 14);
    expect(wr.length).toBe(5);
    wr.forEach((v) => expect(isNaN(v)).toBe(true));
  });

  test("calculatePivotPoints", () => {
    const pp = calculatePivotPoints(data);
    expect(pp.length).toBe(60);
    expect(pp[0]).toHaveProperty("pivot");
    expect(pp[0]).toHaveProperty("r1");
    expect(pp[0]).toHaveProperty("r2");
    expect(pp[0]).toHaveProperty("r3");
    expect(pp[0]).toHaveProperty("s1");
    expect(pp[0]).toHaveProperty("s2");
    expect(pp[0]).toHaveProperty("s3");

    // R values should be above pivot, S values below
    const last = pp[59];
    expect(last.r1).toBeGreaterThan(last.pivot);
    expect(last.s1).toBeLessThan(last.pivot);
    expect(last.r2).toBeGreaterThan(last.r1);
    expect(last.s2).toBeLessThan(last.s1);
  });

  test("calculatePivotPoints with empty data", () => {
    const pp = calculatePivotPoints([]);
    expect(pp.length).toBe(0);
  });

  test("calculateIchimoku", () => {
    const ich = calculateIchimoku(data, 9, 26, 52, 26);
    expect(ich.length).toBe(60);
    expect(ich[59]).toHaveProperty("tenkan");
    expect(ich[59]).toHaveProperty("kijun");
    expect(ich[59]).toHaveProperty("senkouA");
    expect(ich[59]).toHaveProperty("senkouB");
    expect(ich[59]).toHaveProperty("chikou");
  });

  test("calculateIchimoku with short data", () => {
    const shortData = createData(10);
    const ich = calculateIchimoku(shortData, 9, 26, 52, 26);
    expect(ich.length).toBe(10);
    // Early values should be NaN
    expect(isNaN(ich[0].tenkan)).toBe(true);
  });

  test("calculateSupertrend with short data returns NaN", () => {
    const shortData = createData(1);
    const st = calculateSupertrend(shortData, 10, 3);
    expect(st.length).toBe(1);
    expect(isNaN(st[0].supertrend)).toBe(true);
  });

  test("calculateTilsonT3 with empty data returns empty array", () => {
    const t3 = calculateTilsonT3([], 5, 0.7);
    expect(t3.length).toBe(0);
  });

  test("calculateOBV with empty data returns empty array", () => {
    const obv = calculateOBV([]);
    expect(obv.length).toBe(0);
  });

  test("calculateEMA with empty data returns empty array", () => {
    const ema = calculateEMA([], 10);
    expect(ema.length).toBe(0);
  });

  test("calculateATR with short data returns NaN array", () => {
    const shortData = createData(1);
    const atr = calculateATR(shortData, 14);
    expect(atr.length).toBe(1);
    expect(isNaN(atr[0])).toBe(true);
  });

  test("calculateStochastic handles equal high and low", () => {
    // Create data with equal high/low
    const flatData: OHLCVData[] = [];
    for (let i = 0; i < 20; i++) {
      flatData.push({
        date: new Date(),
        open: 100,
        high: 100,
        low: 100,
        close: 100,
        volume: 1000,
      });
    }
    const stoch = calculateStochastic(flatData, 14, 3);
    expect(stoch.length).toBe(20);
    // When range is 0, k defaults to 50
    if (!isNaN(stoch[19].k)) {
      expect(stoch[19].k).toBe(50);
    }
  });

  test("calculateVWAP with empty data returns empty array", () => {
    const vwap = calculateVWAP([]);
    expect(vwap.length).toBe(0);
  });

  test("calculateSMA with short data", () => {
    const shortData = createData(5);
    const sma = calculateSMA(shortData, 20);
    expect(sma.length).toBe(0);
  });

  test("calculateRSI with short data returns NaN array", () => {
    const shortData = createData(5);
    const rsi = calculateRSI(shortData, 14);
    expect(rsi.length).toBe(5);
    rsi.forEach((v) => expect(isNaN(v)).toBe(true));
  });

  test("TechnicalAnalyzer cci method", () => {
    const ta = new TechnicalAnalyzer(data);
    const cci = ta.cci(20);
    expect(cci.length).toBe(60);
  });

  test("TechnicalAnalyzer williamsR method", () => {
    const ta = new TechnicalAnalyzer(data);
    const wr = ta.williamsR(14);
    expect(wr.length).toBe(60);
  });

  test("TechnicalAnalyzer pivotPoints method", () => {
    const ta = new TechnicalAnalyzer(data);
    const pp = ta.pivotPoints();
    expect(pp.length).toBe(60);
  });

  test("TechnicalAnalyzer ichimoku method", () => {
    const ta = new TechnicalAnalyzer(data);
    const ich = ta.ichimoku();
    expect(ich.length).toBe(60);
  });
});
