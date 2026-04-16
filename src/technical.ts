import { calculateHeikinAshi } from "~/charts";
import { OHLCVData } from "~/types";

/**
 * Calculate Simple Moving Average (SMA)
 */
export function calculateSMA(data: OHLCVData[], period: number = 20): number[] {
  if (data.length < period) return [];

  const sma: number[] = [];
  const closes = data.map((d) => d.close);

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      sma.push(NaN);
      continue;
    }

    const slice = closes.slice(i - period + 1, i + 1);
    const sum = slice.reduce((a, b) => a + b, 0);
    sma.push(sum / period);
  }

  return sma;
}

/**
 * Calculate Exponential Moving Average (EMA)
 */
export function calculateEMA(data: OHLCVData[], period: number = 20): number[] {
  if (data.length === 0) return [];

  const ema: number[] = [];
  const closes = data.map((d) => d.close);
  const k = 2 / (period + 1);

  // Initialize with SMA for the first valid point or just the first price
  // Python pandas ewm(adjust=False) starts with the first value as the average
  ema.push(closes[0]);

  for (let i = 1; i < closes.length; i++) {
    const val = closes[i] * k + ema[i - 1] * (1 - k);
    ema.push(val);
  }

  // To match typical library behavior where data before period is NaN or starting,
  // but pandas ewm(span=period, adjust=False) calculates from index 0.
  // Borsapy `df[col].ewm(span=period, adjust=False).mean()`
  // This matches the recursive formula: y_t = (1-a)*y_{t-1} + a*x_t
  // where a = 2/(span+1). Initial y_0 = x_0.
  return ema;
}

/**
 * Calculate RSI (Relative Strength Index)
 */
export function calculateRSI(data: OHLCVData[], period: number = 14): number[] {
  if (data.length < period) {
    return new Array(data.length).fill(NaN);
  }

  const rsi: number[] = [];
  const closes = data.map((d) => d.close);

  // Need to calculate deltas
  const deltas: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    deltas.push(closes[i] - closes[i - 1]);
  }

  // Arrays for gains and losses
  const gains: number[] = deltas.map((d) => (d > 0 ? d : 0));
  const losses: number[] = deltas.map((d) => (d < 0 ? -d : 0));

  // Use Wilder's Smoothing (alpha = 1/period) - same as TradingView
  // Wilder's uses alpha=1/period, NOT span=period (which gives k=2/(period+1))
  const alpha = 1 / period;
  const avgGain: number[] = [];
  const avgLoss: number[] = [];

  // Initialize first values
  if (gains.length > 0) {
    avgGain.push(gains[0]);
    avgLoss.push(losses[0]);
  }

  for (let i = 1; i < gains.length; i++) {
    avgGain.push(gains[i] * alpha + avgGain[i - 1] * (1 - alpha));
    avgLoss.push(losses[i] * alpha + avgLoss[i - 1] * (1 - alpha));
  }

  // Calculate RSI
  // Note: deltas start from index 1 of original data.
  // so avgGain[0] corresponds to index 1 of original data.
  // We need to pad the beginning to match original data length.
  rsi.push(NaN); // For index 0 where diff is impossible

  for (let i = 0; i < avgGain.length; i++) {
    const rs = avgLoss[i] === 0 ? 100 : avgGain[i] / avgLoss[i];
    const val = avgLoss[i] === 0 ? 100 : 100 - 100 / (1 + rs);
    rsi.push(val);
  }

  // Replace NaN for initial period if needed (Borsapy returns NaN if len < period)
  // Python: return pd.Series(np.nan, index=df.index, name=f"RSI_{period}") if len < period
  // We matched that at the start.

  return rsi;
}

/**
 * Calculate Moving Average Convergence Divergence (MACD)
 */
export function calculateMACD(
  data: OHLCVData[],
  fast: number = 12,
  slow: number = 26,
  signal: number = 9,
): Array<{ macd: number; signal: number; histogram: number }> {
  if (data.length === 0) return [];

  const emaFast = calculateEMA(data, fast);
  const emaSlow = calculateEMA(data, slow);

  const macdLine: number[] = [];
  for (let i = 0; i < data.length; i++) {
    macdLine.push(emaFast[i] - emaSlow[i]);
  }

  // Calculate Signal line (EMA of MACD line)
  // We need a helper for EMA of an array, existing calculateEMA takes OHLCVData[]
  const calculateArrayEMA = (values: number[], period: number): number[] => {
    if (values.length === 0) return [];
    const ema: number[] = [];
    const k = 2 / (period + 1);
    ema.push(values[0]);
    for (let i = 1; i < values.length; i++) {
      ema.push(values[i] * k + ema[i - 1] * (1 - k));
    }
    return ema;
  };

  const signalLine = calculateArrayEMA(macdLine, signal);
  const histogram: number[] = [];

  for (let i = 0; i < data.length; i++) {
    histogram.push(macdLine[i] - signalLine[i]);
  }

  return macdLine.map((val, i) => ({
    macd: val,
    signal: signalLine[i],
    histogram: histogram[i],
  }));
}

/**
 * Calculate Bollinger Bands
 */
export function calculateBollingerBands(
  data: OHLCVData[],
  period: number = 20,
  stdDev: number = 2.0,
): Array<{ upper: number; middle: number; lower: number }> {
  const bands: Array<{ upper: number; middle: number; lower: number }> = [];
  const sma = calculateSMA(data, period);
  const closes = data.map((d) => d.close);

  for (let i = 0; i < data.length; i++) {
    if (isNaN(sma[i])) {
      bands.push({ upper: NaN, middle: NaN, lower: NaN });
      continue;
    }

    const slice = closes.slice(i - period + 1, i + 1);
    const mean = sma[i];
    const squaredDiffs = slice.map((val) => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (period - 1);
    const std = Math.sqrt(variance);

    bands.push({
      upper: mean + std * stdDev,
      middle: mean,
      lower: mean - std * stdDev,
    });
  }

  return bands;
}

/**
 * Calculate Average True Range (ATR)
 */
export function calculateATR(data: OHLCVData[], period: number = 14): number[] {
  if (data.length < 2) return new Array(data.length).fill(NaN);

  const tr: number[] = [];
  tr.push(data[0].high - data[0].low);

  for (let i = 1; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i - 1].close;

    const tr1 = high - low;
    const tr2 = Math.abs(high - prevClose);
    const tr3 = Math.abs(low - prevClose);

    tr.push(Math.max(tr1, tr2, tr3));
  }

  const calculateWildersSmoothing = (
    values: number[],
    period: number,
  ): number[] => {
    if (values.length === 0) return [];
    const result: number[] = [];
    const alpha = 1 / period;
    result.push(values[0]);
    for (let i = 1; i < values.length; i++) {
      result.push(values[i] * alpha + result[i - 1] * (1 - alpha));
    }
    return result;
  };

  return calculateWildersSmoothing(tr, period);
}

/**
 * Calculate Stochastic Oscillator
 */
export function calculateStochastic(
  data: OHLCVData[],
  kPeriod: number = 14,
  dPeriod: number = 3,
): Array<{ k: number; d: number }> {
  const kValues: number[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i < kPeriod - 1) {
      kValues.push(NaN);
      continue;
    }

    const slice = data.slice(i - kPeriod + 1, i + 1);
    const lowestLow = Math.min(...slice.map((d) => d.low));
    const highestHigh = Math.max(...slice.map((d) => d.high));
    const close = data[i].close;

    let k = 50;
    if (highestHigh !== lowestLow) {
      k = (100 * (close - lowestLow)) / (highestHigh - lowestLow);
    }
    kValues.push(k);
  }

  const result: Array<{ k: number; d: number }> = [];

  for (let i = 0; i < data.length; i++) {
    if (i < kPeriod - 1) {
      result.push({ k: NaN, d: NaN });
      continue;
    }

    const k = kValues[i];

    let d = NaN;
    if (i >= kPeriod - 1 + dPeriod - 1) {
      const kSlice = kValues.slice(i - dPeriod + 1, i + 1);
      const sum = kSlice.reduce((a, b) => a + b, 0);
      d = sum / dPeriod;
    }

    result.push({ k, d });
  }

  return result;
}

/**
 * Calculate On-Balance Volume (OBV)
 */
export function calculateOBV(data: OHLCVData[]): number[] {
  if (data.length === 0) return [];

  const result: number[] = [0];
  let cum = 0;

  for (let i = 1; i < data.length; i++) {
    const prevClose = data[i - 1].close;
    const close = data[i].close;
    const vol = data[i].volume;

    if (close > prevClose) cum += vol;
    else if (close < prevClose) cum -= vol;

    result.push(cum);
  }
  return result;
}

/**
 * Calculate Volume Weighted Average Price (VWAP)
 */
export function calculateVWAP(data: OHLCVData[]): number[] {
  const vwap: number[] = [];
  let cumTPVol = 0;
  let cumVol = 0;

  for (const d of data) {
    const tp = (d.high + d.low + d.close) / 3;
    cumTPVol += tp * d.volume;
    cumVol += d.volume;

    if (cumVol === 0)
      vwap.push(tp); // Fallback
    else vwap.push(cumTPVol / cumVol);
  }
  return vwap;
}

/**
 * Calculate Average Directional Index (ADX)
 */
export function calculateADX(data: OHLCVData[], period: number = 14): number[] {
  if (data.length < 2) return new Array(data.length).fill(NaN);

  // Components
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const tr: number[] = [data[0].high - data[0].low];

  for (let i = 1; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevHigh = data[i - 1].high;
    const prevLow = data[i - 1].low;
    const prevClose = data[i - 1].close;

    let pdm = high - prevHigh;
    let mdm = prevLow - low;

    if (pdm < 0) pdm = 0;
    if (mdm < 0) mdm = 0;

    if (pdm > mdm) mdm = 0;
    else pdm = 0;

    plusDM.push(pdm);
    minusDM.push(mdm);

    const tr1 = high - low;
    const tr2 = Math.abs(high - prevClose);
    const tr3 = Math.abs(low - prevClose);
    tr.push(Math.max(tr1, tr2, tr3));
  }

  // ADX uses Wilder's smoothing (alpha = 1/period) - same as TradingView
  const calculateWildersSmoothing = (
    values: number[],
    period: number,
  ): number[] => {
    if (values.length === 0) return [];
    const result: number[] = [];
    const alpha = 1 / period;
    result.push(values[0]);
    for (let i = 1; i < values.length; i++) {
      result.push(values[i] * alpha + result[i - 1] * (1 - alpha));
    }
    return result;
  };

  const smoothTR = calculateWildersSmoothing(tr, period);
  const smoothPlusDM = calculateWildersSmoothing(plusDM, period);
  const smoothMinusDM = calculateWildersSmoothing(minusDM, period);

  const dx: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const atr = smoothTR[i];
    if (!atr || atr === 0) {
      dx.push(0);
      continue;
    }

    const plusDI = 100 * (smoothPlusDM[i] / atr);
    const minusDI = 100 * (smoothMinusDM[i] / atr);

    if (plusDI + minusDI === 0) {
      dx.push(0);
    } else {
      dx.push((100 * Math.abs(plusDI - minusDI)) / (plusDI + minusDI));
    }
  }

  // ADX is smoothed DX using Wilder's smoothing
  return calculateWildersSmoothing(dx, period);
}

/**
 * Calculate Supertrend indicator
 */
export function calculateSupertrend(
  data: OHLCVData[],
  atrPeriod: number = 10,
  multiplier: number = 3.0,
): Array<{
  supertrend: number;
  direction: number; // 1 = bullish, -1 = bearish
  upper: number;
  lower: number;
}> {
  if (data.length < 2) {
    return data.map(() => ({
      supertrend: NaN,
      direction: 0,
      upper: NaN,
      lower: NaN,
    }));
  }

  const n = data.length;

  // Calculate True Range
  const tr: number[] = [data[0].high - data[0].low];
  for (let i = 1; i < n; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i - 1].close;
    const tr1 = high - low;
    const tr2 = Math.abs(high - prevClose);
    const tr3 = Math.abs(low - prevClose);
    tr.push(Math.max(tr1, tr2, tr3));
  }

  // Calculate ATR using Wilder's smoothing
  const atr: number[] = [tr[0]];
  const alpha = 1 / atrPeriod;
  for (let i = 1; i < n; i++) {
    atr.push(tr[i] * alpha + atr[i - 1] * (1 - alpha));
  }

  // Calculate basic bands
  const basicUpper: number[] = [];
  const basicLower: number[] = [];
  for (let i = 0; i < n; i++) {
    const hl2 = (data[i].high + data[i].low) / 2;
    basicUpper.push(hl2 + multiplier * atr[i]);
    basicLower.push(hl2 - multiplier * atr[i]);
  }

  // Initialize arrays
  const finalUpper: number[] = new Array(n);
  const finalLower: number[] = new Array(n);
  const supertrend: number[] = new Array(n);
  const direction: number[] = new Array(n);

  // First value
  finalUpper[0] = basicUpper[0];
  finalLower[0] = basicLower[0];
  supertrend[0] = basicUpper[0];
  direction[0] = -1; // Start bearish

  // Calculate Supertrend
  for (let i = 1; i < n; i++) {
    const close = data[i].close;
    const prevClose = data[i - 1].close;

    // Final Upper Band
    if (basicUpper[i] < finalUpper[i - 1] || prevClose > finalUpper[i - 1]) {
      finalUpper[i] = basicUpper[i];
    } else {
      finalUpper[i] = finalUpper[i - 1];
    }

    // Final Lower Band
    if (basicLower[i] > finalLower[i - 1] || prevClose < finalLower[i - 1]) {
      finalLower[i] = basicLower[i];
    } else {
      finalLower[i] = finalLower[i - 1];
    }

    // Supertrend and Direction
    if (supertrend[i - 1] === finalUpper[i - 1]) {
      // Was bearish
      if (close > finalUpper[i]) {
        supertrend[i] = finalLower[i];
        direction[i] = 1; // Bullish
      } else {
        supertrend[i] = finalUpper[i];
        direction[i] = -1; // Bearish
      }
    } else {
      // Was bullish
      if (close < finalLower[i]) {
        supertrend[i] = finalUpper[i];
        direction[i] = -1; // Bearish
      } else {
        supertrend[i] = finalLower[i];
        direction[i] = 1; // Bullish
      }
    }
  }

  return data.map((_, i) => ({
    supertrend: supertrend[i],
    direction: direction[i],
    upper: finalUpper[i],
    lower: finalLower[i],
  }));
}

/**
 * Calculate Tilson T3 Moving Average
 */
export function calculateTilsonT3(
  data: OHLCVData[],
  period: number = 5,
  vfactor: number = 0.7,
): number[] {
  if (data.length === 0) return [];

  const closes = data.map((d) => d.close);

  // Calculate coefficients
  const c1 = -(vfactor ** 3);
  const c2 = 3 * vfactor ** 2 + 3 * vfactor ** 3;
  const c3 = -6 * vfactor ** 2 - 3 * vfactor - 3 * vfactor ** 3;
  const c4 = 1 + 3 * vfactor + vfactor ** 3 + 3 * vfactor ** 2;

  // EMA helper (using span calculation: k = 2/(period+1))
  const ema = (values: number[], p: number): number[] => {
    if (values.length === 0) return [];
    const result: number[] = [values[0]];
    const k = 2 / (p + 1);
    for (let i = 1; i < values.length; i++) {
      result.push(values[i] * k + result[i - 1] * (1 - k));
    }
    return result;
  };

  // Calculate 6 consecutive EMAs
  const ema1 = ema(closes, period);
  const ema2 = ema(ema1, period);
  const ema3 = ema(ema2, period);
  const ema4 = ema(ema3, period);
  const ema5 = ema(ema4, period);
  const ema6 = ema(ema5, period);

  // T3 = c1*e6 + c2*e5 + c3*e4 + c4*e3
  return ema3.map(
    (_, i) => c1 * ema6[i] + c2 * ema5[i] + c3 * ema4[i] + c4 * ema3[i],
  );
}

/**
 * Calculate Highest High Value (HHV)
 *
 * Returns the highest value of a column over a rolling window.
 */
export function calculateHHV(
  data: OHLCVData[],
  period: number = 14,
  column: "high" | "low" | "close" | "open" = "high",
): number[] {
  const values = data.map((d) => d[column]);
  const result: number[] = [];

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }
    const slice = values.slice(i - period + 1, i + 1);
    result.push(Math.max(...slice));
  }

  return result;
}

/**
 * Calculate Lowest Low Value (LLV)
 *
 * Returns the lowest value of a column over a rolling window.
 */
export function calculateLLV(
  data: OHLCVData[],
  period: number = 14,
  column: "high" | "low" | "close" | "open" = "low",
): number[] {
  const values = data.map((d) => d[column]);
  const result: number[] = [];

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }
    const slice = values.slice(i - period + 1, i + 1);
    result.push(Math.min(...slice));
  }

  return result;
}

/**
 * Calculate Momentum (MOM)
 *
 * MOM = Close - Close[N periods ago]
 */
export function calculateMOM(
  data: OHLCVData[],
  period: number = 10,
): number[] {
  const closes = data.map((d) => d.close);
  const result: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      result.push(NaN);
    } else {
      result.push(closes[i] - closes[i - period]);
    }
  }

  return result;
}

/**
 * Calculate Rate of Change (ROC)
 *
 * ROC = ((Close - Close[N]) / Close[N]) * 100
 */
export function calculateROC(
  data: OHLCVData[],
  period: number = 10,
): number[] {
  const closes = data.map((d) => d.close);
  const result: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < period || closes[i - period] === 0) {
      result.push(NaN);
    } else {
      result.push(
        ((closes[i] - closes[i - period]) / closes[i - period]) * 100,
      );
    }
  }

  return result;
}

/**
 * Calculate Weighted Moving Average (WMA)
 *
 * Each data point is weighted by its position (most recent has highest weight).
 */
export function calculateWMA(
  data: OHLCVData[],
  period: number = 20,
): number[] {
  const closes = data.map((d) => d.close);
  const result: number[] = [];
  const weightSum = (period * (period + 1)) / 2;

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }

    let weightedSum = 0;
    for (let j = 0; j < period; j++) {
      weightedSum += closes[i - period + 1 + j] * (j + 1);
    }
    result.push(weightedSum / weightSum);
  }

  return result;
}

/**
 * Calculate Double Exponential Moving Average (DEMA)
 *
 * DEMA = 2 * EMA - EMA(EMA)
 */
export function calculateDEMA(
  data: OHLCVData[],
  period: number = 20,
): number[] {
  const ema1 = calculateEMA(data, period);

  // Calculate EMA of EMA (need to wrap in OHLCVData-like objects)
  const emaData: OHLCVData[] = ema1.map((v, i) => ({
    date: data[i].date,
    open: v,
    high: v,
    low: v,
    close: v,
    volume: 0,
  }));
  const ema2 = calculateEMA(emaData, period);

  return ema1.map((v, i) => 2 * v - ema2[i]);
}

/**
 * Calculate Triple Exponential Moving Average (TEMA)
 *
 * TEMA = 3*EMA - 3*EMA(EMA) + EMA(EMA(EMA))
 */
export function calculateTEMA(
  data: OHLCVData[],
  period: number = 20,
): number[] {
  const ema1 = calculateEMA(data, period);

  const wrapAsOHLCV = (values: number[]): OHLCVData[] =>
    values.map((v, i) => ({
      date: data[i].date,
      open: v,
      high: v,
      low: v,
      close: v,
      volume: 0,
    }));

  const ema2 = calculateEMA(wrapAsOHLCV(ema1), period);
  const ema3 = calculateEMA(wrapAsOHLCV(ema2), period);

  return ema1.map((v, i) => 3 * v - 3 * ema2[i] + ema3[i]);
}

/**
 * Calculate Commodity Channel Index (CCI)
 */
export function calculateCCI(data: OHLCVData[], period: number = 20): number[] {
  if (data.length < period) {
    return new Array(data.length).fill(NaN);
  }

  const result: number[] = [];
  const constant = 0.015;

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }

    // Calculate Typical Price for current bar
    const tp = (data[i].high + data[i].low + data[i].close) / 3;

    // Calculate SMA of Typical Price
    let tpSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      tpSum += (data[j].high + data[j].low + data[j].close) / 3;
    }
    const tpSma = tpSum / period;

    // Calculate Mean Deviation
    let mdSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const tpJ = (data[j].high + data[j].low + data[j].close) / 3;
      mdSum += Math.abs(tpJ - tpSma);
    }
    const meanDeviation = mdSum / period;

    // CCI = (TP - SMA(TP)) / (0.015 * Mean Deviation)
    const cci =
      meanDeviation === 0 ? 0 : (tp - tpSma) / (constant * meanDeviation);
    result.push(cci);
  }

  return result;
}

/**
 * Calculate Williams %R
 */
export function calculateWilliamsR(
  data: OHLCVData[],
  period: number = 14,
): number[] {
  if (data.length < period) {
    return new Array(data.length).fill(NaN);
  }

  const result: number[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }

    // Find highest high and lowest low in period
    let highestHigh = -Infinity;
    let lowestLow = Infinity;

    for (let j = i - period + 1; j <= i; j++) {
      if (data[j].high > highestHigh) highestHigh = data[j].high;
      if (data[j].low < lowestLow) lowestLow = data[j].low;
    }

    // Williams %R = (Highest High - Close) / (Highest High - Lowest Low) * -100
    const range = highestHigh - lowestLow;
    const wr =
      range === 0 ? -50 : ((highestHigh - data[i].close) / range) * -100;
    result.push(wr);
  }

  return result;
}

/**
 * Calculate Pivot Points (Standard/Classic)
 */
export function calculatePivotPoints(data: OHLCVData[]): Array<{
  pivot: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
}> {
  const result: Array<{
    pivot: number;
    r1: number;
    r2: number;
    r3: number;
    s1: number;
    s2: number;
    s3: number;
  }> = [];

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      // First bar: use current bar's data
      const high = data[i].high;
      const low = data[i].low;
      const close = data[i].close;

      const pivot = (high + low + close) / 3;
      const r1 = 2 * pivot - low;
      const s1 = 2 * pivot - high;
      const r2 = pivot + (high - low);
      const s2 = pivot - (high - low);
      const r3 = high + 2 * (pivot - low);
      const s3 = low - 2 * (high - pivot);

      result.push({ pivot, r1, r2, r3, s1, s2, s3 });
    } else {
      // Use previous bar (daily pivot on today's chart)
      const prev = data[i - 1];
      const high = prev.high;
      const low = prev.low;
      const close = prev.close;

      const pivot = (high + low + close) / 3;
      const r1 = 2 * pivot - low;
      const s1 = 2 * pivot - high;
      const r2 = pivot + (high - low);
      const s2 = pivot - (high - low);
      const r3 = high + 2 * (pivot - low);
      const s3 = low - 2 * (high - pivot);

      result.push({ pivot, r1, r2, r3, s1, s2, s3 });
    }
  }

  return result;
}

/**
 * Calculate Ichimoku Cloud
 */
export function calculateIchimoku(
  data: OHLCVData[],
  conversionPeriod: number = 9,
  basePeriod: number = 26,
  spanBPeriod: number = 52,
  _displacement: number = 26,
): Array<{
  tenkan: number; // Conversion Line
  kijun: number; // Base Line
  senkouA: number; // Leading Span A
  senkouB: number; // Leading Span B
  chikou: number; // Lagging Span
}> {
  const result: Array<{
    tenkan: number;
    kijun: number;
    senkouA: number;
    senkouB: number;
    chikou: number;
  }> = [];

  // Helper: calculate (highest high + lowest low) / 2 over period
  function midpoint(start: number, end: number): number {
    if (start < 0) start = 0;
    if (end >= data.length) end = data.length - 1;

    let highest = -Infinity;
    let lowest = Infinity;
    for (let j = start; j <= end; j++) {
      if (data[j].high > highest) highest = data[j].high;
      if (data[j].low < lowest) lowest = data[j].low;
    }
    return (highest + lowest) / 2;
  }

  for (let i = 0; i < data.length; i++) {
    // Tenkan-sen (Conversion Line): 9-period midpoint
    const tenkan =
      i >= conversionPeriod - 1 ? midpoint(i - conversionPeriod + 1, i) : NaN;

    // Kijun-sen (Base Line): 26-period midpoint
    const kijun = i >= basePeriod - 1 ? midpoint(i - basePeriod + 1, i) : NaN;

    // Senkou Span A: (Tenkan + Kijun) / 2, displaced forward
    // We store it at current index but it represents future position
    const senkouA =
      !isNaN(tenkan) && !isNaN(kijun) ? (tenkan + kijun) / 2 : NaN;

    // Senkou Span B: 52-period midpoint, displaced forward
    const senkouB =
      i >= spanBPeriod - 1 ? midpoint(i - spanBPeriod + 1, i) : NaN;

    // Chikou Span: Current close, displayed 26 periods back
    // At index i, chikou represents price from 26 periods ago
    const chikou = data[i].close;

    result.push({ tenkan, kijun, senkouA, senkouB, chikou });
  }

  return result;
}

export interface IndicatorData extends OHLCVData {
  [key: string]: number | Date | undefined;
}

export interface AddIndicatorsOptions {
  indicators?: string[];
  smaPeriod?: number;
  emaPeriod?: number;
  rsiPeriod?: number;
  bbPeriod?: number;
  atrPeriod?: number;
  adxPeriod?: number;
  supertrendPeriod?: number;
  supertrendMultiplier?: number;
  cciPeriod?: number;
  williamsRPeriod?: number;
  // MetaStock indicators
  hhvPeriod?: number;
  llvPeriod?: number;
  momPeriod?: number;
  rocPeriod?: number;
  wmaPeriod?: number;
  demaPeriod?: number;
  temaPeriod?: number;
}

/**
 * Add technical indicator columns to OHLCV data
 *
 * @example
 * ```ts
 * const dataWithIndicators = addIndicators(ohlcvData, {
 *   indicators: ["sma", "rsi", "macd"],
 *   smaPeriod: 20,
 *   rsiPeriod: 14,
 * });
 * ```
 */
export function addIndicators(
  data: OHLCVData[],
  options: AddIndicatorsOptions = {},
): IndicatorData[] {
  const {
    indicators = [
      "sma",
      "ema",
      "rsi",
      "macd",
      "bollinger",
      "atr",
      "stochastic",
      "adx",
    ],
    smaPeriod = 20,
    emaPeriod = 12,
    rsiPeriod = 14,
    bbPeriod = 20,
    atrPeriod = 14,
    adxPeriod = 14,
    supertrendPeriod = 10,
    supertrendMultiplier = 3.0,
    cciPeriod = 20,
    williamsRPeriod = 14,
    hhvPeriod = 14,
    llvPeriod = 14,
    momPeriod = 10,
    rocPeriod = 10,
    wmaPeriod = 20,
    demaPeriod = 20,
    temaPeriod = 20,
  } = options;

  // Calculate all indicators once
  const calculatedIndicators: Record<
    string,
    (number | { [k: string]: number })[]
  > = {};

  for (const indicator of indicators) {
    const ind = indicator.toLowerCase();
    switch (ind) {
      case "sma":
        calculatedIndicators[`sma_${smaPeriod}`] = calculateSMA(
          data,
          smaPeriod,
        );
        break;
      case "ema":
        calculatedIndicators[`ema_${emaPeriod}`] = calculateEMA(
          data,
          emaPeriod,
        );
        break;
      case "rsi":
        calculatedIndicators[`rsi_${rsiPeriod}`] = calculateRSI(
          data,
          rsiPeriod,
        );
        break;
      case "macd":
        calculatedIndicators["macd"] = calculateMACD(data);
        break;
      case "bollinger":
        calculatedIndicators["bollinger"] = calculateBollingerBands(
          data,
          bbPeriod,
        );
        break;
      case "atr":
        calculatedIndicators[`atr_${atrPeriod}`] = calculateATR(
          data,
          atrPeriod,
        );
        break;
      case "stochastic":
        calculatedIndicators["stochastic"] = calculateStochastic(data);
        break;
      case "obv":
        calculatedIndicators["obv"] = calculateOBV(data);
        break;
      case "vwap":
        calculatedIndicators["vwap"] = calculateVWAP(data);
        break;
      case "adx":
        calculatedIndicators[`adx_${adxPeriod}`] = calculateADX(
          data,
          adxPeriod,
        );
        break;
      case "supertrend":
        calculatedIndicators["supertrend"] = calculateSupertrend(
          data,
          supertrendPeriod,
          supertrendMultiplier,
        );
        break;
      case "cci":
        calculatedIndicators[`cci_${cciPeriod}`] = calculateCCI(
          data,
          cciPeriod,
        );
        break;
      case "williamsr":
        calculatedIndicators[`williamsR_${williamsRPeriod}`] =
          calculateWilliamsR(data, williamsRPeriod);
        break;
      case "hhv":
        calculatedIndicators[`hhv_${hhvPeriod}`] = calculateHHV(
          data,
          hhvPeriod,
          "high",
        );
        break;
      case "llv":
        calculatedIndicators[`llv_${llvPeriod}`] = calculateLLV(
          data,
          llvPeriod,
          "low",
        );
        break;
      case "mom":
        calculatedIndicators[`mom_${momPeriod}`] = calculateMOM(
          data,
          momPeriod,
        );
        break;
      case "roc":
        calculatedIndicators[`roc_${rocPeriod}`] = calculateROC(
          data,
          rocPeriod,
        );
        break;
      case "wma":
        calculatedIndicators[`wma_${wmaPeriod}`] = calculateWMA(
          data,
          wmaPeriod,
        );
        break;
      case "dema":
        calculatedIndicators[`dema_${demaPeriod}`] = calculateDEMA(
          data,
          demaPeriod,
        );
        break;
      case "tema":
        calculatedIndicators[`tema_${temaPeriod}`] = calculateTEMA(
          data,
          temaPeriod,
        );
        break;
    }
  }

  // Build result array with all indicators appended
  return data.map((item, i) => {
    const result: IndicatorData = { ...item };

    for (const [key, values] of Object.entries(calculatedIndicators)) {
      if (key === "macd") {
        const macdValues = values as Array<{
          macd: number;
          signal: number;
          histogram: number;
        }>;
        result.macd = macdValues[i]?.macd;
        result.macd_signal = macdValues[i]?.signal;
        result.macd_histogram = macdValues[i]?.histogram;
      } else if (key === "bollinger") {
        const bbValues = values as Array<{
          upper: number;
          middle: number;
          lower: number;
        }>;
        result.bb_upper = bbValues[i]?.upper;
        result.bb_middle = bbValues[i]?.middle;
        result.bb_lower = bbValues[i]?.lower;
      } else if (key === "stochastic") {
        const stochValues = values as Array<{ k: number; d: number }>;
        result.stoch_k = stochValues[i]?.k;
        result.stoch_d = stochValues[i]?.d;
      } else if (key === "supertrend") {
        const stValues = values as Array<{
          supertrend: number;
          direction: number;
          upper: number;
          lower: number;
        }>;
        result.supertrend = stValues[i]?.supertrend;
        result.supertrend_direction = stValues[i]?.direction;
      } else {
        result[key] = (values as number[])[i];
      }
    }

    return result;
  });
}

/**
 * Technical analyzer class
 */
export class TechnicalAnalyzer {
  private data: OHLCVData[];

  constructor(data: OHLCVData[]) {
    this.data = [...data].sort((a, b) => a.date.getTime() - b.date.getTime()); // Ensure sorted
  }

  heikinAshi(): OHLCVData[] {
    return calculateHeikinAshi(this.data);
  }

  /** Get latest values for all indicators */
  get latest(): Record<string, number> {
    if (this.data.length === 0) return {};

    const result: Record<string, number> = {};
    const lastIdx = this.data.length - 1;

    // SMAs
    result.sma_20 = this.sma(20)[lastIdx];
    result.sma_50 = this.sma(50)[lastIdx];

    // EMAs
    result.ema_12 = this.ema(12)[lastIdx];
    result.ema_26 = this.ema(26)[lastIdx];

    // RSI
    result.rsi_14 = this.rsi(14)[lastIdx];

    // MACD
    const macd = this.macd()[lastIdx];
    result.macd = macd.macd;
    result.macd_signal = macd.signal;
    result.macd_histogram = macd.histogram;

    // Bollinger
    const bb = this.bollingerBands()[lastIdx];
    result.bb_upper = bb.upper;
    result.bb_middle = bb.middle;
    result.bb_lower = bb.lower;

    // ATR
    result.atr_14 = this.atr(14)[lastIdx];

    // ADX
    result.adx_14 = this.adx(14)[lastIdx];

    // MetaStock indicators
    result.mom_10 = this.mom(10)[lastIdx];
    result.roc_10 = this.roc(10)[lastIdx];
    result.wma_20 = this.wma(20)[lastIdx];
    result.dema_20 = this.dema(20)[lastIdx];
    result.tema_20 = this.tema(20)[lastIdx];
    result.hhv_14 = this.hhv(14)[lastIdx];
    result.llv_14 = this.llv(14)[lastIdx];

    // Stoch
    const stoch = this.stochastic()[lastIdx];
    result.stoch_k = stoch.k;
    result.stoch_d = stoch.d;

    // OBV
    result.obv = this.obv()[lastIdx];

    // VWAP
    result.vwap = this.vwap()[lastIdx];

    // Round all values
    for (const key of Object.keys(result)) {
      if (typeof result[key] === "number" && !isNaN(result[key])) {
        result[key] = Math.round(result[key] * 10000) / 10000;
      }
    }

    return result;
  }

  rsi(period: number = 14): number[] {
    return calculateRSI(this.data, period);
  }

  sma(period: number = 20): number[] {
    return calculateSMA(this.data, period);
  }

  ema(period: number = 12): number[] {
    return calculateEMA(this.data, period);
  }

  macd(
    fast = 12,
    slow = 26,
    signal = 9,
  ): Array<{ macd: number; signal: number; histogram: number }> {
    return calculateMACD(this.data, fast, slow, signal);
  }

  bollingerBands(
    period: number = 20,
    stdDev: number = 2.0,
  ): Array<{ upper: number; middle: number; lower: number }> {
    return calculateBollingerBands(this.data, period, stdDev);
  }

  atr(period = 14): number[] {
    return calculateATR(this.data, period);
  }

  stochastic(kPeriod = 14, dPeriod = 3): Array<{ k: number; d: number }> {
    return calculateStochastic(this.data, kPeriod, dPeriod);
  }

  obv(): number[] {
    return calculateOBV(this.data);
  }

  vwap(): number[] {
    return calculateVWAP(this.data);
  }

  adx(period = 14): number[] {
    return calculateADX(this.data, period);
  }

  supertrend(
    atrPeriod = 10,
    multiplier = 3.0,
  ): Array<{
    supertrend: number;
    direction: number;
    upper: number;
    lower: number;
  }> {
    return calculateSupertrend(this.data, atrPeriod, multiplier);
  }

  tilsonT3(period = 5, vfactor = 0.7): number[] {
    return calculateTilsonT3(this.data, period, vfactor);
  }

  hhv(period: number = 14, column: "high" | "low" | "close" | "open" = "high"): number[] {
    return calculateHHV(this.data, period, column);
  }

  llv(period: number = 14, column: "high" | "low" | "close" | "open" = "low"): number[] {
    return calculateLLV(this.data, period, column);
  }

  mom(period: number = 10): number[] {
    return calculateMOM(this.data, period);
  }

  roc(period: number = 10): number[] {
    return calculateROC(this.data, period);
  }

  wma(period: number = 20): number[] {
    return calculateWMA(this.data, period);
  }

  dema(period: number = 20): number[] {
    return calculateDEMA(this.data, period);
  }

  tema(period: number = 20): number[] {
    return calculateTEMA(this.data, period);
  }

  cci(period = 20): number[] {
    return calculateCCI(this.data, period);
  }

  williamsR(period = 14): number[] {
    return calculateWilliamsR(this.data, period);
  }

  pivotPoints(): Array<{
    pivot: number;
    r1: number;
    r2: number;
    r3: number;
    s1: number;
    s2: number;
    s3: number;
  }> {
    return calculatePivotPoints(this.data);
  }

  ichimoku(
    conversionPeriod = 9,
    basePeriod = 26,
    spanBPeriod = 52,
  ): Array<{
    tenkan: number;
    kijun: number;
    senkouA: number;
    senkouB: number;
    chikou: number;
  }> {
    return calculateIchimoku(
      this.data,
      conversionPeriod,
      basePeriod,
      spanBPeriod,
    );
  }
}
