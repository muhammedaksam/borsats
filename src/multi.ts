import { Ticker } from "~/ticker";
import { Interval, OHLCVData, Period } from "~/types";

/**
 * Tickers class for managing multiple tickers
 */
export class Tickers {
  public readonly symbols: string[];
  public readonly tickers: Record<string, Ticker>;

  constructor(symbols: string | string[]) {
    if (typeof symbols === "string") {
      this.symbols = symbols
        .split(/\s+/)
        .filter((s) => s.length > 0)
        .map((s) => s.toUpperCase());
    } else {
      this.symbols = symbols.map((s) => s.toUpperCase());
    }

    this.tickers = {};

    for (const symbol of this.symbols) {
      this.tickers[symbol] = new Ticker(symbol);
    }
  }

  /**
   * Get historical data for all tickers
   */
  async history(
    options: {
      period?: Period;
      interval?: Interval;
      start?: Date | string;
      end?: Date | string;
      groupBy?: "ticker" | "column";
      progress?: boolean;
      onProgress?: (progress: number) => void;
    } = {},
  ): Promise<Record<string, OHLCVData[]>> {
    return download(this.symbols, options);
  }
}

/**
 * Download historical data for multiple tickers
 */
export async function download(
  tickers: string | string[],
  options: {
    period?: Period;
    interval?: Interval;
    start?: Date | string;
    end?: Date | string;
    groupBy?: "ticker" | "column";
    progress?: boolean;
    onProgress?: (progress: number) => void;
  } = {},
): Promise<Record<string, OHLCVData[]>> {
  let symbols: string[];
  if (typeof tickers === "string") {
    symbols = tickers
      .split(/\s+/)
      .filter((s) => s.length > 0)
      .map((s) => s.toUpperCase());
  } else {
    symbols = tickers.map((s) => s.toUpperCase());
  }

  const {
    groupBy: _groupBy = "column",
    onProgress,
    progress: _progress,
    ...historyOptions
  } = options;

  const results: Record<string, OHLCVData[]> = {};
  let completed = 0;

  for (const symbol of symbols) {
    try {
      const ticker = new Ticker(symbol);
      const data = await ticker.history(historyOptions);
      if (data && data.length > 0) {
        results[symbol] = data;
      }
    } catch {
      // Skip failed symbols silently
    }

    completed++;
    if (onProgress) {
      onProgress(Math.round((completed / symbols.length) * 100));
    }
  }

  return results;
}
