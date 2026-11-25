import { getBTCTurkProvider } from "~/providers/btcturk";
import { getScannerProvider, TASignals } from "~/providers/tradingview-scanner";
import { TechnicalAnalyzer, TechnicalMixin } from "~/technical";
import {
  buildCryptoQuery,
  searchTweets,
  Tweet,
  TwitterSearchOptions,
} from "~/twitter";
import { CurrentData, Interval, OHLCVData, Period } from "~/types";

const CRYPTO_INTERVALS = new Set([
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "45m",
  "1h",
  "4h",
  "1d",
  "1w",
]);

export class Crypto extends TechnicalMixin {
  private _pair: string;
  private _currentCache: CurrentData | null = null;

  constructor(pair: string) {
    super();
    this._pair = pair.toUpperCase();
  }

  protected async _getTechnicalHistory(
    period: Period = "1y",
    interval: Interval = "1d",
  ): Promise<OHLCVData[]> {
    return this.history({ period, interval });
  }

  /**
   * Search Twitter/X for tweets related to this cryptocurrency pair.
   */
  async tweets(
    options: TwitterSearchOptions & { query?: string } = {},
  ): Promise<Tweet[]> {
    const { query, ...searchOpts } = options;
    const q = query || buildCryptoQuery(this._pair);
    return searchTweets(q, searchOpts);
  }

  get pair(): string {
    return this._pair;
  }

  get symbol(): string {
    return this._pair;
  }

  private get _btcturk() {
    return getBTCTurkProvider();
  }

  get current(): Promise<CurrentData> {
    if (this._currentCache) return Promise.resolve(this._currentCache);
    return getBTCTurkProvider()
      .getTicker(this._pair)
      .then((d: CurrentData) => {
        this._currentCache = d;
        return d;
      });
  }

  get info(): Promise<CurrentData> {
    return this.current;
  }

  async history(
    options: {
      period?: string;
      interval?: string;
      start?: Date | string;
      end?: Date | string;
    } = {},
  ): Promise<OHLCVData[]> {
    const { period, interval = "1d", start, end } = options;
    const endDate = end ? new Date(end) : undefined;
    let startDate = start ? new Date(start) : undefined;

    if (!startDate && period) {
      const periodDays: Record<string, number> = {
        "1d": 1,
        "5d": 5,
        "1w": 7,
        "1mo": 30,
        "3mo": 90,
        "6mo": 180,
        "1y": 365,
      };
      const days = periodDays[period] ?? 30;
      const refEnd = endDate || new Date();
      startDate = new Date(refEnd.getTime() - days * 24 * 60 * 60 * 1000);
    }

    return getBTCTurkProvider().getHistory({
      pair: this._pair,
      interval,
      start: startDate,
      end: endDate,
    });
  }

  async technicals(
    periodOrInterval: Period | Interval = "1y",
    interval?: Interval,
  ): Promise<TechnicalAnalyzer> {
    if (!interval && CRYPTO_INTERVALS.has(periodOrInterval)) {
      const hist = await this.history({ interval: periodOrInterval });
      return new TechnicalAnalyzer(hist);
    }
    const hist = await this.history({
      period: periodOrInterval,
      interval: interval || "1d",
    });
    return new TechnicalAnalyzer(hist);
  }

  /**
   * Get TradingView technical analysis signals
   */
  async taSignals(interval: Interval = "1d"): Promise<TASignals> {
    // Extract base currency from pair (e.g., "BTCTRY" -> "BTC")
    const base = this._pair.replace("TRY", "").replace("USDT", "");
    // Use Binance USDT pair for better TradingView coverage
    const provider = getScannerProvider();
    return provider.getTASignals(`BINANCE:${base}USDT`, "crypto", interval);
  }

  /**
   * Get TA signals for all available timeframes
   */
  async taSignalsAllTimeframes(): Promise<
    Record<string, TASignals | { error: string }>
  > {
    const intervals: Interval[] = [
      "1m",
      "5m",
      "15m",
      "30m",
      "1h",
      "4h",
      "1d",
      "1w",
      "1mo",
    ];
    const result: Record<string, TASignals | { error: string }> = {};

    for (const interval of intervals) {
      try {
        result[interval] = await this.taSignals(interval);
      } catch (e) {
        result[interval] = {
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }

    return result;
  }
}

export function cryptoPairs(quote: string = "TRY") {
  return getBTCTurkProvider().getPairs(quote);
}

/**
 * Alias for cryptoPairs (retained for backward compatibility)
 */
export function cryptoList(quote: string = "TRY") {
  return cryptoPairs(quote);
}
