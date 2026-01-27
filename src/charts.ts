import { OHLCVData } from "@/types";

/**
 * Calculate Heikin Ashi candlesticks from standard OHLCV data.
 *
 * Heikin Ashi candles smooth price data and help identify trends more clearly.
 *
 * Formulas:
 * HA_Close = (Open + High + Low + Close) / 4
 * HA_Open = (Previous_HA_Open + Previous_HA_Close) / 2
 * HA_High = max(High, HA_Open, HA_Close)
 * HA_Low = min(Low, HA_Open, HA_Close)
 *
 * @param data Standard OHLCV data array
 * @returns Heikin Ashi OHLCV data array
 */
export function calculateHeikinAshi(data: OHLCVData[] | null): OHLCVData[] {
  if (!data || data.length === 0) {
    return [];
  }

  const result: OHLCVData[] = [];

  // First candle
  const first = data[0];
  let haOpen = (first.open + first.close) / 2;
  let haClose = (first.open + first.high + first.low + first.close) / 4;
  let haHigh = Math.max(first.high, haOpen, haClose);
  let haLow = Math.min(first.low, haOpen, haClose);

  result.push({
    date: first.date,
    open: haOpen,
    high: haHigh,
    low: haLow,
    close: haClose,
    volume: first.volume,
  });

  // Subsequent candles
  for (let i = 1; i < data.length; i++) {
    const curr = data[i];
    const prevHaOpen = result[i - 1].open;
    const prevHaClose = result[i - 1].close;

    haOpen = (prevHaOpen + prevHaClose) / 2;
    haClose = (curr.open + curr.high + curr.low + curr.close) / 4;
    haHigh = Math.max(curr.high, haOpen, haClose);
    haLow = Math.min(curr.low, haOpen, haClose);

    result.push({
      date: curr.date,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      volume: curr.volume,
    });
  }

  return result;
}
