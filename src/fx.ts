import {
  CanlidovizProvider,
  getCanliDovizProvider,
} from "~/providers/canlidoviz";
import { getDovizcomProvider } from "~/providers/dovizcom";
import { getTradingViewProvider } from "~/providers/tradingview";
import { getScannerProvider, TASignals } from "~/providers/tradingview-scanner";
import { TechnicalMixin } from "~/technical";
import {
  buildFxQuery,
  searchTweets,
  Tweet,
  TwitterSearchOptions,
} from "~/twitter";
import {
  BankRate,
  CurrentData,
  Interval,
  MetalInstitutionRate,
  OHLCVData,
  Period,
} from "~/types";

const TV_CURRENCY_MAP: Record<string, [string, string]> = {
  USD: ["FX", "USDTRY"],
  EUR: ["FX", "EURTRY"],
  GBP: ["PEPPERSTONE", "GBPTRY"],
  JPY: ["FX", "TRYJPY"],
};

const TV_COMMODITY_MAP: Record<string, [string, string]> = {
  "ons-altin": ["OANDA", "XAUUSD"],
  XAU: ["OANDA", "XAUUSD"],
  XAG: ["OANDA", "XAGUSD"],
  "XAG-USD": ["OANDA", "XAGUSD"],
  XPT: ["OANDA", "XPTUSD"],
  "XPT-USD": ["OANDA", "XPTUSD"],
  XPD: ["OANDA", "XPDUSD"],
  "XPD-USD": ["OANDA", "XPDUSD"],
  BRENT: ["TVC", "UKOIL"],
  WTI: ["TVC", "USOIL"],
};

export class FX extends TechnicalMixin {
  private _asset: string;
  private _currentCache: CurrentData | null = null;

  constructor(asset: string) {
    super();
    this._asset = asset;
  }

  static banks() {
    return getDovizcomProvider().getBanks();
  }

  static metalInstitutions() {
    return getDovizcomProvider().getMetalInstitutions();
  }

  protected async _getTechnicalHistory(
    period: Period = "1y",
    interval: Interval = "1d",
  ): Promise<OHLCVData[]> {
    return this.history({ period, interval });
  }

  /**
   * Search Twitter/X for tweets related to this FX/commodity asset.
   */
  async tweets(
    options: TwitterSearchOptions & { query?: string } = {},
  ): Promise<Tweet[]> {
    const { query, ...searchOpts } = options;
    const q = query || buildFxQuery(this._asset);
    return searchTweets(q, searchOpts);
  }

  get asset(): string {
    return this._asset;
  }

  get symbol(): string {
    return this._asset;
  }

  private get _canlidoviz() {
    return getCanliDovizProvider();
  }

  private get _dovizcom() {
    return getDovizcomProvider();
  }

  private get _tradingview() {
    return getTradingViewProvider();
  }

  private isCanliDovizSupported(): boolean {
    const assetUpper = this._asset.toUpperCase();
    return (
      Object.keys(CanlidovizProvider.CURRENCY_IDS || {}).includes(assetUpper) ||
      Object.keys(CanlidovizProvider.METAL_IDS || {}).includes(this._asset) ||
      Object.keys(CanlidovizProvider.ENERGY_IDS || {}).includes(assetUpper) ||
      Object.keys(CanlidovizProvider.COMMODITY_IDS || {}).includes(assetUpper)
    );
  }

  private getTradingViewSymbol(): [string, string] | null {
    const assetUpper = this._asset.toUpperCase();
    if (TV_CURRENCY_MAP[assetUpper]) return TV_CURRENCY_MAP[assetUpper];
    if (TV_COMMODITY_MAP[this._asset]) return TV_COMMODITY_MAP[this._asset];
    if (TV_COMMODITY_MAP[assetUpper]) return TV_COMMODITY_MAP[assetUpper];
    return null;
  }

  get current(): Promise<CurrentData> {
    if (this._currentCache) return Promise.resolve(this._currentCache);

    if (this.isCanliDovizSupported()) {
      return this._canlidoviz
        .getCurrentRate(this._asset)
        .then((d: CurrentData) => {
          this._currentCache = d;
          return d;
        });
    }

    return this._dovizcom
      .getCurrent(this._asset)
      .catch(() => this._currentFromBankRates())
      .then((d: CurrentData) => {
        this._currentCache = d;
        return d;
      });
  }

  private async _currentFromBankRates(): Promise<CurrentData> {
    const rates = await this.bankRates;
    if (!rates || rates.length === 0) {
      throw new Error(`No data available for ${this._asset}`);
    }
    const mids = rates.map((r) => (r.buy + r.sell) / 2);
    const avgMid = mids.reduce((a, b) => a + b, 0) / mids.length;
    const high = Math.max(...rates.map((r) => r.sell));
    const low = Math.min(...rates.map((r) => r.buy));

    return {
      symbol: this._asset,
      last: avgMid,
      open: avgMid,
      high,
      low,
      updateTime: new Date(),
    };
  }

  get info(): Promise<CurrentData> {
    return this.current;
  }

  get bankRates(): Promise<BankRate[]> {
    return this._dovizcom.getBankRates(this._asset).then((res) => {
      // If array, return it. If single object, wrap.
      if (Array.isArray(res)) return res;
      return [res];
    });
  }

  /**
   * Get exchange rate from a specific bank (e.g., "akbank", "garanti", "isbank").
   */
  async bankRate(bank: string): Promise<BankRate> {
    const res = await this._dovizcom.getBankRates(this._asset, bank);
    if (!Array.isArray(res)) return res;
    const needle = bank.toLowerCase();
    const match = res.find((r) => r.bank.toLowerCase() === needle);
    if (!match) {
      throw new Error(`Bank ${bank} not found for ${this._asset}`);
    }
    return match;
  }

  async institutionRates(): Promise<MetalInstitutionRate[]> {
    return this._dovizcom
      .getMetalInstitutionRates(this._asset)
      .then((res) => (Array.isArray(res) ? res : [res]));
  }

  async institutionRate(institution: string): Promise<MetalInstitutionRate> {
    const rates = await this.institutionRates();
    const rate = rates.find((r) => r.institution === institution);
    if (!rate) throw new Error(`Institution ${institution} not found`);
    return rate;
  }

  async institutionHistory(
    institution: string,
    options: {
      period?: string;
      start?: Date | string;
      end?: Date | string;
    } = {},
  ): Promise<OHLCVData[]> {
    const { period = "1mo", start, end } = options;
    const startDt = start ? new Date(start) : undefined;
    const endDt = end ? new Date(end) : undefined;

    const assetUpper = this._asset.toUpperCase();
    const useCanliDoviz =
      Object.keys(CanlidovizProvider.CURRENCY_IDS || {}).includes(assetUpper) ||
      ["gram-altin", "gumus", "gram-platin"].includes(this._asset);

    if (useCanliDoviz) {
      try {
        return await this._canlidoviz.getHistory({
          asset: this._asset,
          period,
          start: startDt,
          end: endDt,
          institution,
        });
      } catch {
        // Fallback to dovizcom
      }
    }

    return this._dovizcom.getInstitutionHistory({
      asset: this._asset,
      institution,
      period,
      start: startDt,
      end: endDt,
    });
  }

  async history(
    options: {
      period?: string; // 1d, 1mo
      interval?: string; // 1d, 1m...
      start?: Date | string;
      end?: Date | string;
    } = {},
  ): Promise<OHLCVData[]> {
    const { period = "1mo", interval = "1d", start, end } = options;
    const startDt = start ? new Date(start) : undefined;
    const endDt = end ? new Date(end) : undefined;

    const now = new Date();
    const e = endDt || now;
    let s = startDt;
    if (!s) {
      const periodDays: Record<string, number> = {
        "1d": 1,
        "5d": 5,
        "1w": 7,
        "1mo": 30,
        "3mo": 90,
        "6mo": 180,
        "1y": 365,
        "2y": 730,
        "5y": 1825,
        max: 3650,
      };
      if (period === "ytd") {
        s = new Date(e.getFullYear(), 0, 1);
      } else {
        const days = periodDays[period] ?? 30;
        s = new Date(e.getTime() - days * 24 * 60 * 60 * 1000);
      }
    }

    // Use TradingView for intraday
    const intraday = ["1m", "5m", "15m", "30m", "1h", "4h"];
    if (intraday.includes(interval)) {
      const tv = this.getTradingViewSymbol();
      if (!tv)
        throw new Error(`Intraday data not available for ${this._asset}`);
      const [exchange, symbol] = tv;

      return this._tradingview.getHistory({
        exchange,
        symbol,
        interval,
        start: s,
        end: e,
      });
    }

    // Daily and above
    if (this.isCanliDovizSupported()) {
      return this._canlidoviz.getHistory({
        asset: this._asset,
        period,
        start: s,
        end: e,
      });
    }

    return this._dovizcom.getHistory({
      asset: this._asset,
      period: period, // dovizcom may need casting if type mismatch
      start: s,
      end: e,
    });
  }

  /**
   * Get TradingView technical analysis signals
   */
  async taSignals(interval: Interval = "1d"): Promise<TASignals> {
    const tv = this.getTradingViewSymbol();
    if (!tv) {
      throw new Error(`TA signals not available for ${this._asset}`);
    }

    const [exchange, symbol] = tv;
    let screener = "forex";

    // Commodities like Gold/Brent often use global or america screener for some symbols
    // but borsapy uses "forex" for FX/Commodities mostly.
    // Let's check TV_COMMODITY_MAP exchanges
    if (exchange === "TVC") screener = "global";

    const provider = getScannerProvider();
    return provider.getTASignals(`${exchange}:${symbol}`, screener, interval);
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

export function banks() {
  return getDovizcomProvider().getBanks();
}

export function metalInstitutions() {
  return getDovizcomProvider().getMetalInstitutions();
}
