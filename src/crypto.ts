import { getBTCTurkProvider } from "~/providers/btcturk";
import { TechnicalAnalyzer } from "~/technical";
import { CurrentData, OHLCVData } from "~/types";

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
}

export function cryptoList() {
  return getBTCTurkProvider().getPairs();
}
