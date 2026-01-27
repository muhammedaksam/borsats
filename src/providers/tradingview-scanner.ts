import { APIError } from "@/exceptions";
import { BaseProvider } from "@/providers/base";

export const OSCILLATOR_COLUMNS = [
  "RSI",
  "RSI[1]",
  "Stoch.K",
  "Stoch.D",
  "Stoch.K[1]",
  "Stoch.D[1]",
  "CCI20",
  "CCI20[1]",
  "ADX",
  "ADX+DI",
  "ADX-DI",
  "ADX+DI[1]",
  "ADX-DI[1]",
  "AO",
  "AO[1]",
  "AO[2]",
  "Mom",
  "Mom[1]",
  "MACD.macd",
  "MACD.signal",
  "Rec.Stoch.RSI",
  "Stoch.RSI.K",
  "Rec.WR",
  "W.R",
  "Rec.BBPower",
  "BBPower",
  "Rec.UO",
  "UO",
];

export const MOVING_AVERAGE_COLUMNS = [
  "EMA5",
  "SMA5",
  "EMA10",
  "SMA10",
  "EMA20",
  "SMA20",
  "EMA30",
  "SMA30",
  "EMA50",
  "SMA50",
  "EMA100",
  "SMA100",
  "EMA200",
  "SMA200",
  "Rec.Ichimoku",
  "Ichimoku.BLine",
  "Rec.VWMA",
  "VWMA",
  "Rec.HullMA9",
  "HullMA9",
  "close",
];

export const INTERVAL_MAP: Record<string, string> = {
  "1m": "|1",
  "5m": "|5",
  "15m": "|15",
  "30m": "|30",
  "1h": "|60",
  "2h": "|120",
  "4h": "|240",
  "1d": "",
  "1W": "|1W",
  "1M": "|1M",
};

export interface TASignalGroup {
  recommendation: string;
  buy: number;
  sell: number;
  neutral: number;
  compute?: Record<string, string>;
  values?: Record<string, number | null>;
}

export interface TASignals {
  symbol: string;
  exchange: string;
  interval: string;
  summary: TASignalGroup;
  oscillators: TASignalGroup;
  moving_averages: TASignalGroup;
}

interface ScannerResponse {
  data: ScannerRow[];
  totalCount: number;
}

interface ScannerRow {
  s: string;
  d: (number | string | null)[];
}

export class TradingViewScannerProvider extends BaseProvider {
  private static readonly SCANNER_URL =
    "https://scanner.tradingview.com/{screener}/scan";

  private static readonly SCREENERS: Record<string, string> = {
    turkey: "turkey",
    forex: "forex",
    crypto: "crypto",
    america: "america",
    europe: "europe",
    global: "global",
  };

  private static readonly CACHE_TTL = 60; // 1 min

  constructor() {
    super();
  }

  async getTASignals(
    symbol: string,
    screener: string = "turkey",
    interval: string = "1d",
  ): Promise<TASignals> {
    const cacheKey = `ta_signals:${symbol}:${screener}:${interval}`;

    const cached = this.cache.get(cacheKey);
    if (cached) return cached as TASignals;

    if (!TradingViewScannerProvider.SCREENERS[screener]) {
      throw new Error(`Invalid screener: ${screener}`);
    }
    if (INTERVAL_MAP[interval] === undefined) {
      throw new Error(`Invalid interval: ${interval}`);
    }

    const oscCols = this._getColumnsWithInterval(OSCILLATOR_COLUMNS, interval);
    const maCols = this._getColumnsWithInterval(
      MOVING_AVERAGE_COLUMNS,
      interval,
    );
    const allCols = [...oscCols, ...maCols];

    const payload = {
      symbols: { tickers: [symbol], query: { types: [] } },
      columns: allCols,
    };

    const url = TradingViewScannerProvider.SCANNER_URL.replace(
      "{screener}",
      screener,
    );

    try {
      const response = await this.client.post(url, payload);
      const data: ScannerResponse = response.data;

      if (!data.data || data.data.length === 0) {
        throw new APIError(`No data found for symbol: ${symbol}`);
      }

      const row = data.data[0];
      const symbolName: string = row.s || symbol;
      const values = row.d || [];

      // Map columns to values
      const rawValues: Record<string, unknown> = {};
      allCols.forEach((col, idx) => {
        rawValues[col] = values[idx];
      });

      const suffix = INTERVAL_MAP[interval] || "";
      const result = this._calculateSignals(rawValues, suffix, interval);

      let exchange = screener.toUpperCase();
      let sym = symbolName;
      if (symbolName.includes(":")) {
        const parts = symbolName.split(":", 2);
        exchange = parts[0];
        sym = parts[1];
      }

      result.symbol = sym;
      result.exchange = exchange;
      result.interval = interval;

      this.cache.set(cacheKey, result, TradingViewScannerProvider.CACHE_TTL);
      return result;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new APIError(`TradingView Scanner API error: ${msg}`);
    }
  }

  private _getColumnsWithInterval(
    columns: string[],
    interval: string,
  ): string[] {
    const suffix = INTERVAL_MAP[interval] || "";
    return columns.map((c) => `${c}${suffix}`);
  }

  private _calculateSignals(
    rawValues: Record<string, unknown>,
    suffix: string,
    interval: string,
  ): TASignals {
    const oscCompute: Record<string, string> = {};
    const oscValues: Record<string, number | null> = {};

    // Helper to get value
    const get = (key: string): number | null => {
      const val = rawValues[`${key}${suffix}`];
      return typeof val === "number" ? val : null;
    };

    // RSI
    const rsi = get("RSI");
    if (rsi !== null) {
      oscValues["RSI"] = Number(rsi.toFixed(2));
      if (rsi < 30) oscCompute["RSI"] = "BUY";
      else if (rsi > 70) oscCompute["RSI"] = "SELL";
      else oscCompute["RSI"] = "NEUTRAL";
    }

    // Stoch K
    const stochK = get("Stoch.K");
    const stochD = get("Stoch.D");
    if (stochK !== null) {
      oscValues["Stoch.K"] = Number(stochK.toFixed(2));
      oscValues["Stoch.D"] = stochD !== null ? Number(stochD.toFixed(2)) : null;
      if (stochD !== null) {
        if (stochK < 20 && stochK > stochD) oscCompute["Stoch.K"] = "BUY";
        else if (stochK > 80 && stochK < stochD) oscCompute["Stoch.K"] = "SELL";
        else oscCompute["Stoch.K"] = "NEUTRAL";
      }
    }

    // CCI
    const cci = get("CCI20");
    if (cci !== null) {
      oscValues["CCI20"] = Number(cci.toFixed(2));
      if (cci < -100) oscCompute["CCI20"] = "BUY";
      else if (cci > 100) oscCompute["CCI20"] = "SELL";
      else oscCompute["CCI20"] = "NEUTRAL";
    }

    // ADX
    const adx = get("ADX");
    const adxPlus = get("ADX+DI");
    const adxMinus = get("ADX-DI");
    if (adx !== null) {
      oscValues["ADX"] = Number(adx.toFixed(2));
      oscValues["ADX+DI"] =
        adxPlus !== null ? Number(adxPlus.toFixed(2)) : null;
      oscValues["ADX-DI"] =
        adxMinus !== null ? Number(adxMinus.toFixed(2)) : null;

      if (adxPlus !== null && adxMinus !== null && adx > 20) {
        if (adxPlus > adxMinus) oscCompute["ADX"] = "BUY";
        else if (adxMinus > adxPlus) oscCompute["ADX"] = "SELL";
        else oscCompute["ADX"] = "NEUTRAL";
      } else {
        oscCompute["ADX"] = "NEUTRAL";
      }
    }

    // AO
    const ao = get("AO");
    const aoPrev = get("AO[1]");
    if (ao !== null) {
      oscValues["AO"] = Number(ao.toFixed(4));
      if (aoPrev !== null) {
        if (ao > 0 && ao > aoPrev) oscCompute["AO"] = "BUY";
        else if (ao < 0 && ao < aoPrev) oscCompute["AO"] = "SELL";
        else oscCompute["AO"] = "NEUTRAL";
      }
    }

    // Mom
    const mom = get("Mom");
    const momPrev = get("Mom[1]");
    if (mom !== null) {
      oscValues["Mom"] = Number(mom.toFixed(4));
      if (momPrev !== null) {
        if (mom > momPrev) oscCompute["Mom"] = "BUY";
        else if (mom < momPrev) oscCompute["Mom"] = "SELL";
        else oscCompute["Mom"] = "NEUTRAL";
      }
    }

    // MACD
    const macd = get("MACD.macd");
    const macdSig = get("MACD.signal");
    if (macd !== null) {
      oscValues["MACD.macd"] = Number(macd.toFixed(4));
      oscValues["MACD.signal"] =
        macdSig !== null ? Number(macdSig.toFixed(4)) : null;
      if (macdSig !== null) {
        if (macd > macdSig) oscCompute["MACD"] = "BUY";
        else if (macd < macdSig) oscCompute["MACD"] = "SELL";
        else oscCompute["MACD"] = "NEUTRAL";
      }
    }

    // Recs
    this._processRec(
      get,
      oscValues,
      oscCompute,
      "Rec.Stoch.RSI",
      "Stoch.RSI.K",
      "Stoch.RSI",
    );
    this._processRec(get, oscValues, oscCompute, "Rec.WR", "W.R", "W.R");
    this._processRec(
      get,
      oscValues,
      oscCompute,
      "Rec.BBPower",
      "BBPower",
      "BBPower",
    );
    this._processRec(get, oscValues, oscCompute, "Rec.UO", "UO", "UO");

    // Moving Averages
    const maCompute: Record<string, string> = {};
    const maValues: Record<string, number | null> = {};

    const close = get("close");
    if (close !== null) {
      maValues["close"] = Number(close.toFixed(4));
    }

    [5, 10, 20, 30, 50, 100, 200].forEach((p) => {
      const emaKey = `EMA${p}`;
      const smaKey = `SMA${p}`;
      const emaVal = get(emaKey);
      const smaVal = get(smaKey);

      if (emaVal !== null) {
        maValues[emaKey] = Number(emaVal.toFixed(4));
        if (close !== null) {
          if (close > emaVal) maCompute[emaKey] = "BUY";
          else if (close < emaVal) maCompute[emaKey] = "SELL";
          else maCompute[emaKey] = "NEUTRAL";
        }
      }

      if (smaVal !== null) {
        maValues[smaKey] = Number(smaVal.toFixed(4));
        if (close !== null) {
          if (close > smaVal) maCompute[smaKey] = "BUY";
          else if (close < smaVal) maCompute[smaKey] = "SELL";
          else maCompute[smaKey] = "NEUTRAL";
        }
      }
    });

    this._processRec(
      get,
      maValues,
      maCompute,
      "Rec.Ichimoku",
      "Ichimoku.BLine",
      "Ichimoku",
    );
    this._processRec(get, maValues, maCompute, "Rec.VWMA", "VWMA", "VWMA");
    this._processRec(
      get,
      maValues,
      maCompute,
      "Rec.HullMA9",
      "HullMA9",
      "HullMA9",
    );

    const oscCounts = this._countSignals(oscCompute);
    const maCounts = this._countSignals(maCompute);

    const totalBuy = oscCounts.buy + maCounts.buy;
    const totalSell = oscCounts.sell + maCounts.sell;
    const totalNeutral = oscCounts.neutral + maCounts.neutral;

    return {
      symbol: "", // set by caller
      exchange: "", // set by caller
      interval,
      summary: {
        recommendation: this._getRecommendation(
          totalBuy,
          totalSell,
          totalNeutral,
        ),
        buy: totalBuy,
        sell: totalSell,
        neutral: totalNeutral,
      },
      oscillators: {
        recommendation: this._getRecommendation(
          oscCounts.buy,
          oscCounts.sell,
          oscCounts.neutral,
        ),
        ...oscCounts,
        compute: oscCompute,
        values: oscValues,
      },
      moving_averages: {
        recommendation: this._getRecommendation(
          maCounts.buy,
          maCounts.sell,
          maCounts.neutral,
        ),
        ...maCounts,
        compute: maCompute,
        values: maValues,
      },
    };
  }

  private _processRec(
    get: (k: string) => number | null,
    values: Record<string, number | null>,
    compute: Record<string, string>,
    recKey: string,
    valKey: string,
    outKey: string,
  ) {
    const rec = get(recKey);
    if (rec !== null) {
      const val = get(valKey);
      if (val !== null) values[valKey] = val;
      compute[outKey] = this._recToSignal(rec);
    }
  }

  private _recToSignal(val: number): string {
    if (val >= 0.5) return "BUY";
    if (val <= -0.5) return "SELL";
    return "NEUTRAL";
  }

  private _countSignals(compute: Record<string, string>) {
    let [buy, sell, neutral] = [0, 0, 0];
    Object.values(compute).forEach((s) => {
      if (s === "BUY") buy++;
      else if (s === "SELL") sell++;
      else neutral++;
    });
    return { buy, sell, neutral };
  }

  private _getRecommendation(
    buy: number,
    sell: number,
    neutral: number,
  ): string {
    const total = buy + sell + neutral;
    if (total === 0) return "NEUTRAL";
    const score = (buy - sell) / total;
    if (score >= 0.5) return "STRONG_BUY";
    if (score >= 0.1) return "BUY";
    if (score <= -0.5) return "STRONG_SELL";
    if (score <= -0.1) return "SELL";
    return "NEUTRAL";
  }
}

let _scannerProvider: TradingViewScannerProvider | null = null;
export function getScannerProvider(): TradingViewScannerProvider {
  if (!_scannerProvider) _scannerProvider = new TradingViewScannerProvider();
  return _scannerProvider;
}
