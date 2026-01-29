import { getBTCTurkProvider } from "~/providers/btcturk";
import { getScannerProvider, TASignals } from "~/providers/tradingview-scanner";
import { TechnicalAnalyzer } from "~/technical";
import { CurrentData, Interval, OHLCVData } from "~/types";

export class Crypto {
  private _pair: string;
  private _currentCache: CurrentData | null = null;

  constructor(pair: string) {
    this._pair = pair.toUpperCase();
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

  async history(
    options: {
      interval?: string;
      start?: Date | string;
      end?: Date | string;
    } = {},
  ): Promise<OHLCVData[]> {
    const { interval = "1d", start, end } = options;
    const startDate = start ? new Date(start) : undefined;
    const endDate = end ? new Date(end) : undefined;

    return getBTCTurkProvider().getHistory({
      pair: this._pair,
      interval,
      start: startDate,
      end: endDate,
    });
  }

  async technicals(interval: string = "1d"): Promise<TechnicalAnalyzer> {
    const hist = await this.history({ interval });
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

export function cryptoList() {
  return getBTCTurkProvider().getPairs();
}
