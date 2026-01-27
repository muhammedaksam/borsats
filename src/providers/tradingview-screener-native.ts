/**
 * TradingView-native screening provider
 *
 * Provides batch screening with FIELD_MAP for indicator names
 * and TVScreenerProvider for condition-based scanning.
 */

import { APIError } from "@/exceptions";
import { BaseProvider } from "@/providers/base";

export const FIELD_MAP: Record<string, string> = {
  // Price fields
  price: "close",
  close: "close",
  open: "open",
  high: "high",
  low: "low",
  volume: "volume",
  change: "change",
  change_percent: "change",
  market_cap: "market_cap_basic",

  // RSI
  rsi: "RSI",
  rsi_7: "RSI7",
  rsi_14: "RSI",

  // Moving Averages - SMA
  sma_5: "SMA5",
  sma_10: "SMA10",
  sma_20: "SMA20",
  sma_30: "SMA30",
  sma_50: "SMA50",
  sma_100: "SMA100",
  sma_200: "SMA200",

  // Moving Averages - EMA
  ema_5: "EMA5",
  ema_10: "EMA10",
  ema_12: "EMA12",
  ema_20: "EMA20",
  ema_26: "EMA26",
  ema_50: "EMA50",
  ema_100: "EMA100",
  ema_200: "EMA200",

  // MACD
  macd: "MACD.macd",
  signal: "MACD.signal",
  macd_signal: "MACD.signal",
  histogram: "MACD.hist",
  macd_histogram: "MACD.hist",

  // Stochastic
  stoch_k: "Stoch.K",
  stoch_d: "Stoch.D",

  // ADX
  adx: "ADX",
  adx_14: "ADX",

  // CCI
  cci: "CCI20",
  cci_20: "CCI20",

  // Awesome Oscillator
  ao: "AO",

  // Momentum
  mom: "Mom",
  momentum: "Mom",

  // Bollinger Bands
  bb_upper: "BB.upper",
  bb_lower: "BB.lower",
  bb_middle: "BB.basis",
  bb_basis: "BB.basis",

  // ATR
  atr: "ATR",
  atr_14: "ATR",

  // Williams %R
  williams_r: "W.R",
  wr: "W.R",

  // VWMA
  vwma: "VWMA",

  // Parabolic SAR
  psar: "P.SAR",
  parabolic_sar: "P.SAR",

  // Aroon
  aroon_up: "Aroon.Up",
  aroon_down: "Aroon.Down",

  // Ichimoku
  ichimoku_base: "Ichimoku.BLine",
  ichimoku_conversion: "Ichimoku.CLine",

  // Ratings
  rating: "Recommend.All",
  rating_ma: "Recommend.MA",
  rating_oscillators: "Recommend.Other",
};

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
  "1wk": "|1W",
  "1M": "|1M",
  "1mo": "|1M",
};

export const OPERATORS: Record<string, string> = {
  ">": "greater",
  "<": "less",
  ">=": "egreater",
  "<=": "eless",
  "==": "equal",
  "!=": "nequal",
};

export const LOCAL_CALC_FIELDS = new Set([
  "supertrend",
  "supertrend_direction",
  "supertrend_upper",
  "supertrend_lower",
  "t3",
  "tilson_t3",
]);

export const DEFAULT_COLUMNS = [
  "name",
  "close",
  "change",
  "volume",
  "market_cap_basic",
];

export interface ScanOptions {
  symbols: string[];
  conditions: string[];
  columns?: string[];
  interval?: string;
  limit?: number;
}

export interface ScanResult {
  symbol: string;
  close?: number;
  change?: number;
  volume?: number;
  market_cap?: number;
  [key: string]: string | number | null | undefined;
}

interface ParsedCondition {
  left: string;
  operator: string;
  right: string | number;
}

export class TVScreenerProvider extends BaseProvider {
  private static readonly SCANNER_URL =
    "https://scanner.tradingview.com/turkey/scan";

  /**
   * Get TradingView column name for a field
   */
  getTVColumn(field: string, interval: string = "1d"): string {
    field = field.toLowerCase().trim();

    let tvCol: string;

    if (FIELD_MAP[field]) {
      tvCol = FIELD_MAP[field];
    } else {
      // Dynamic patterns: sma_N, ema_N, rsi_N
      const smaMatch = field.match(/^sma_(\d+)$/);
      if (smaMatch) {
        tvCol = `SMA${smaMatch[1]}`;
      } else {
        const emaMatch = field.match(/^ema_(\d+)$/);
        if (emaMatch) {
          tvCol = `EMA${emaMatch[1]}`;
        } else {
          const rsiMatch = field.match(/^rsi_(\d+)$/);
          if (rsiMatch) {
            tvCol = rsiMatch[1] === "14" ? "RSI" : `RSI${rsiMatch[1]}`;
          } else {
            tvCol = field;
          }
        }
      }
    }

    // Apply interval suffix for non-daily
    const suffix = INTERVAL_MAP[interval] || "";
    if (suffix && !tvCol.endsWith("]")) {
      tvCol = `${tvCol}${suffix}`;
    }

    return tvCol;
  }

  /**
   * Parse a number with K/M/B suffixes
   */
  parseNumber(value: string): number {
    value = value.trim().toUpperCase();
    const multipliers: Record<string, number> = {
      K: 1_000,
      M: 1_000_000,
      B: 1_000_000_000,
    };

    for (const [suffix, mult] of Object.entries(multipliers)) {
      if (value.endsWith(suffix)) {
        return parseFloat(value.slice(0, -1)) * mult;
      }
    }

    return parseFloat(value);
  }

  /**
   * Check if field requires local calculation
   */
  requiresLocalCalc(field: string): boolean {
    field = field.toLowerCase().trim();
    if (LOCAL_CALC_FIELDS.has(field)) return true;
    if (
      field.startsWith("supertrend") ||
      field.startsWith("t3_") ||
      field.startsWith("tilson_t3")
    ) {
      return true;
    }
    return false;
  }

  /**
   * Parse a condition string
   */
  parseCondition(condition: string, interval: string): ParsedCondition | null {
    condition = condition.trim().toLowerCase();

    // Pattern: field op value
    const match = condition.match(/^(\w+)\s*(>=|<=|>|<|==|!=)\s*(.+)$/);
    if (!match) return null;

    const left = match[1].trim();
    const operator = match[2].trim();
    const rightStr = match[3].trim();

    // Try to parse right as number
    try {
      const rightNum = this.parseNumber(rightStr);
      if (!isNaN(rightNum)) {
        return {
          left: this.getTVColumn(left, interval),
          operator,
          right: rightNum,
        };
      }
    } catch {
      // Right is a field name
    }

    // Right is a field
    return {
      left: this.getTVColumn(left, interval),
      operator,
      right: this.getTVColumn(rightStr, interval),
    };
  }

  /**
   * Extract field names from condition
   */
  extractFields(condition: string): string[] {
    const cleaned = condition
      .toLowerCase()
      .replace(/(>=|<=|>|<|==|!=)/g, " ")
      .replace(
        /\b(and|or|crosses_above|crosses_below|crosses|above_pct|below_pct)\b/g,
        " ",
      );

    const tokens = cleaned.split(/\s+/).filter((t) => t.length > 0);
    const fields: string[] = [];

    for (const token of tokens) {
      try {
        this.parseNumber(token);
      } catch {
        fields.push(token);
      }
    }

    return fields;
  }

  /**
   * Separate conditions into API and local
   */
  separateConditions(conditions: string[]): {
    api: string[];
    local: string[];
  } {
    const api: string[] = [];
    const local: string[] = [];

    for (const cond of conditions) {
      const fields = this.extractFields(cond);
      const needsLocal = fields.some((f) => this.requiresLocalCalc(f));

      if (needsLocal) {
        local.push(cond);
      } else {
        api.push(cond);
      }
    }

    return { api, local };
  }

  /**
   * Get columns to select
   */
  getSelectColumns(
    conditions: string[],
    extraColumns: string[] | undefined,
    interval: string,
  ): string[] {
    const columns = new Set(DEFAULT_COLUMNS);

    for (const cond of conditions) {
      const fields = this.extractFields(cond);
      for (const field of fields) {
        const tvCol = this.getTVColumn(field, interval);
        const baseCol = tvCol.split("|")[0];
        columns.add(baseCol);
      }
    }

    if (extraColumns) {
      for (const col of extraColumns) {
        const tvCol = this.getTVColumn(col, interval);
        const baseCol = tvCol.split("|")[0];
        columns.add(baseCol);
      }
    }

    return Array.from(columns);
  }

  /**
   * Execute scan using TradingView Scanner API
   */
  async scan(options: ScanOptions): Promise<ScanResult[]> {
    const {
      symbols,
      conditions,
      columns,
      interval = "1d",
      limit = 100,
    } = options;

    if (!symbols.length || !conditions.length) {
      return [];
    }

    const symbolsUpper = symbols.map((s) => s.toUpperCase());
    const { api: apiConditions, local: localConditions } =
      this.separateConditions(conditions);

    // Only API conditions
    if (apiConditions.length > 0 && localConditions.length === 0) {
      return this.scanAPI(
        symbolsUpper,
        apiConditions,
        columns,
        interval,
        limit,
      );
    }

    // Only local conditions - need to implement local calculation
    if (localConditions.length > 0 && apiConditions.length === 0) {
      // For now, throw error - local calc requires fetching historical data
      throw new Error(
        `Local calculation conditions not yet supported: ${localConditions.join(", ")}`,
      );
    }

    // Both - first filter with API, then apply local
    const apiResults = await this.scanAPI(
      symbolsUpper,
      apiConditions,
      columns,
      interval,
      limit * 5,
    );
    // Local filtering would go here
    return apiResults.slice(0, limit);
  }

  private async scanAPI(
    symbols: string[],
    conditions: string[],
    columns: string[] | undefined,
    interval: string,
    limit: number,
  ): Promise<ScanResult[]> {
    // Build filter
    const filters: Array<{
      left: string;
      operation: string;
      right: string | number;
    }> = [];

    for (const cond of conditions) {
      const parsed = this.parseCondition(cond, interval);
      if (parsed) {
        filters.push({
          left: parsed.left,
          operation: OPERATORS[parsed.operator] || "equal",
          right: parsed.right,
        });
      }
    }

    if (filters.length === 0) {
      return [];
    }

    const selectColumns = this.getSelectColumns(conditions, columns, interval);

    const payload = {
      filter: filters,
      options: { lang: "tr" },
      markets: ["turkey"],
      symbols: { tickers: symbols.map((s) => `BIST:${s}`) },
      columns: selectColumns,
      sort: { sortBy: "volume", sortOrder: "desc" },
      range: [0, limit * 10],
    };

    try {
      const data = await this.request<{
        data?: Array<{ s: string; d: (number | string | null)[] }>;
      }>(TVScreenerProvider.SCANNER_URL, {
        method: "POST",
        data: payload,
        headers: { "Content-Type": "application/json" },
      });

      if (!data.data) return [];

      const results: ScanResult[] = [];

      for (const row of data.data) {
        const symbol = row.s.replace("BIST:", "");

        // Only include if in requested symbols
        if (!symbols.includes(symbol)) continue;

        const result: ScanResult = { symbol };

        selectColumns.forEach((col, idx) => {
          const val = row.d[idx];
          const key = col
            .toLowerCase()
            .replace("market_cap_basic", "market_cap");
          result[key] = val as number | null;
        });

        results.push(result);
      }

      return results.slice(0, limit);
    } catch (e) {
      throw new APIError(`TradingView Scanner API error: ${e}`);
    }
  }
}

let _provider: TVScreenerProvider | null = null;

export function getTVScreenerProvider(): TVScreenerProvider {
  if (!_provider) {
    _provider = new TVScreenerProvider();
  }
  return _provider;
}
