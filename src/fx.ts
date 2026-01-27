import {
  CanlidovizProvider,
  getCanliDovizProvider,
} from "@/providers/canlidoviz";
import { getDovizcomProvider } from "@/providers/dovizcom";
import { getTradingViewProvider } from "@/providers/tradingview";
import {
  BankRate,
  CurrentData,
  MetalInstitutionRate,
  OHLCVData,
} from "@/types";

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

export class FX {
  private _asset: string;
  private _currentCache: CurrentData | null = null;

  constructor(asset: string) {
    this._asset = asset;
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

    return this._dovizcom.getCurrent(this._asset).then((d: CurrentData) => {
      this._currentCache = d;
      return d;
    });
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

  async institutionRates(): Promise<MetalInstitutionRate[]> {
    return this._dovizcom
      .getMetalInstitutionRates(this._asset)
      .then((res) => (Array.isArray(res) ? res : [res]));
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
      s = new Date(e.getTime() - 30 * 24 * 60 * 60 * 1000);
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
}

export function banks() {
  return getDovizcomProvider().getBanks();
}

export function metalInstitutions() {
  return getDovizcomProvider().getMetalInstitutions();
}
