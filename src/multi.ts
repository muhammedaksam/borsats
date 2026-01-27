import { Ticker } from "@/ticker";
import { Interval, OHLCVData, Period } from "@/types";

/**
 * Tickers class for managing multiple tickers
 */
export class Tickers {
  public readonly symbols: string[];
  public readonly tickers: Record<string, Ticker>;

  constructor(symbols: string[]) {
    this.symbols = symbols;
    this.tickers = {};

    for (const symbol of symbols) {
      this.tickers[symbol] = new Ticker(symbol);
    }
  }
}

/**
 * Download historical data for multiple tickers
 */
export async function download(
  symbols: string[],
  options: {
    period?: Period;
    interval?: Interval;
    start?: Date | string;
    end?: Date | string;
    groupBy?: "ticker" | "column";
  } = {},
): Promise<Record<string, OHLCVData[]>> {
  const { groupBy: _groupBy = "column", ...historyOptions } = options;

  const results: Record<string, OHLCVData[]> = {};

  for (const symbol of symbols) {
    const ticker = new Ticker(symbol);
    const data = await ticker.history(historyOptions);
    results[symbol] = data;
  }

  // Note: Currently only implements ticker-based grouping
  // Column-based grouping (pandas-like) would require restructuring the data
  return results;
}
