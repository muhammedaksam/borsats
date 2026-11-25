import { getBistIndexProvider } from "~/providers/bist-index";
import { INTERVAL_MAP } from "~/providers/tradingview-scanner";
import { getTVScreenerProvider } from "~/providers/tradingview-screener-native";
import { Interval, Period } from "~/types";

/**
 * Result of scanning a single symbol
 */
export interface ScanResult {
  symbol: string;
  data: Record<string, unknown>;
  conditionsMet: string[];
  timestamp: Date;
}

/**
 * Convenience function for quick technical scanning
 *
 * @example
 * ```ts
 * import { scan } from "@muhammedaksam/borsats";
 *
 * // RSI oversold
 * const results = await scan("XU030", "rsi < 30");
 *
 * // Price above SMA50
 * const results = await scan("XU100", "close > sma_50");
 *
 * // Compound condition
 * const results = await scan("XU030", "rsi < 30 and volume > 1000000");
 * ```
 */
export async function scan(
  universe: string | string[],
  condition: string,
  interval: Interval = "1d",
  limit: number = 100,
): Promise<ScanResult[]> {
  const scanner = new TechnicalScanner();
  await scanner.setUniverse(universe);
  scanner.addCondition(condition);
  scanner.setInterval(interval);
  return scanner.run(limit);
}

/**
 * Technical Scanner for BIST stocks using TradingView data
 *
 * Provides a fluent API for building and executing stock scans based on
 * technical indicators.
 *
 * @example
 * ```ts
 * const scanner = new TechnicalScanner();
 * await scanner.setUniverse("XU030");
 * scanner.addCondition("rsi < 30", "oversold");
 * scanner.addCondition("volume > 1000000", "high_vol");
 * const results = await scanner.run();
 * ```
 *
 * Supported Timeframes: "1m", "5m", "15m", "30m", "1h", "2h", "4h", "1d", "1W", "1M"
 */
export class TechnicalScanner {
  private _symbols: string[] = [];
  private _conditions: string[] = [];
  private _conditionNames: Map<string, string> = new Map();
  private _interval: Interval = "1d";
  private _extraColumns: string[] = [];

  /**
   * Set the universe of symbols to scan
   *
   * @param universe - Index symbol (e.g., "XU030", "XU100") or list of stock symbols
   */
  async setUniverse(universe: string | string[]): Promise<TechnicalScanner> {
    if (typeof universe === "string") {
      // Check if it's an index
      if (universe.toUpperCase().startsWith("X")) {
        try {
          const provider = getBistIndexProvider();
          const components = await provider.getComponents(
            universe.toUpperCase(),
          );
          this._symbols = components.map((c: { symbol: string }) => c.symbol);
        } catch {
          // Not a valid index, treat as single symbol
          this._symbols = [universe.toUpperCase()];
        }
      } else {
        this._symbols = [universe.toUpperCase()];
      }
    } else {
      this._symbols = universe.map((s) => s.toUpperCase());
    }
    return this;
  }

  /**
   * Add a single symbol to the universe
   */
  addSymbol(symbol: string): TechnicalScanner {
    const s = symbol.toUpperCase();
    if (!this._symbols.includes(s)) {
      this._symbols.push(s);
    }
    return this;
  }

  /**
   * Remove a symbol from the universe
   */
  removeSymbol(symbol: string): TechnicalScanner {
    const s = symbol.toUpperCase();
    const idx = this._symbols.indexOf(s);
    if (idx >= 0) this._symbols.splice(idx, 1);
    return this;
  }

  /**
   * Add a scanning condition
   *
   * Conditions are combined with AND logic.
   *
   * @param condition - Condition string (e.g., "rsi < 30", "close > sma_50")
   * @param name - Optional name for the condition
   *
   * Supported Syntax:
   * - Simple: "rsi < 30", "volume > 1000000"
   * - Field comparison: "close > sma_50", "macd > signal"
   * - Compound (AND): "rsi < 30 and volume > 1000000"
   */
  addCondition(condition: string, name?: string): TechnicalScanner {
    const parts = condition
      .toLowerCase()
      .split(" and ")
      .map((c) => c.trim());
    for (const part of parts) {
      if (part && !this._conditions.includes(part)) {
        this._conditions.push(part);
        const condName = name && parts.length === 1 ? name : part;
        this._conditionNames.set(part, condName);
      }
    }
    return this;
  }

  /**
   * Remove a condition by name or condition string
   */
  removeCondition(nameOrCondition: string): TechnicalScanner {
    const lower = nameOrCondition.toLowerCase();
    for (const [cond, cname] of this._conditionNames) {
      if (cname === nameOrCondition || cond === lower) {
        const idx = this._conditions.indexOf(cond);
        if (idx >= 0) this._conditions.splice(idx, 1);
        this._conditionNames.delete(cond);
        break;
      }
    }
    return this;
  }

  /**
   * Clear all conditions
   */
  clearConditions(): TechnicalScanner {
    this._conditions = [];
    this._conditionNames.clear();
    return this;
  }

  /**
   * Set the data interval/timeframe for indicators
   *
   * @param interval - "1m", "5m", "15m", "30m", "1h", "2h", "4h", "1d", "1W", "1M"
   */
  setInterval(interval: Interval): TechnicalScanner {
    if (INTERVAL_MAP[interval] !== undefined) {
      this._interval = interval;
    }
    return this;
  }

  /**
   * Add extra column to retrieve in results
   */
  addColumn(column: string): TechnicalScanner {
    if (!this._extraColumns.includes(column)) {
      this._extraColumns.push(column);
    }
    return this;
  }

  /**
   * Execute the scan and return results using TradingView's native Screener API
   * (with parallelized local indicator calculation for Supertrend & Tilson T3).
   */
  async run(limit: number = 100): Promise<ScanResult[]> {
    if (this._symbols.length === 0 || this._conditions.length === 0) {
      return [];
    }

    const screener = getTVScreenerProvider();
    try {
      const rawResults = await screener.scan({
        symbols: this._symbols,
        conditions: this._conditions,
        columns: this._extraColumns.length > 0 ? this._extraColumns : undefined,
        interval: this._interval,
        limit,
      });

      const conditionLabels = this._conditions.map(
        (c) => this._conditionNames.get(c) || c,
      );
      const now = new Date();

      return rawResults.map((row) => ({
        symbol: row.symbol,
        data: row as Record<string, unknown>,
        conditionsMet: [...conditionLabels],
        timestamp: now,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Evaluate a single condition against data
   */
  private _evaluateCondition(
    condition: string,
    data: Record<string, unknown>,
  ): boolean {
    // Parse condition: "rsi < 30", "close > sma_50", etc.
    const operators = ["<=", ">=", "<", ">", "==", "!="];
    for (const op of operators) {
      if (condition.includes(op)) {
        const [left, right] = condition.split(op).map((s) => s.trim());
        const leftVal = this._getValue(left, data);
        const rightVal = this._getValue(right, data);

        if (leftVal === null || rightVal === null) return false;

        switch (op) {
          case "<":
            return leftVal < rightVal;
          case ">":
            return leftVal > rightVal;
          case "<=":
            return leftVal <= rightVal;
          case ">=":
            return leftVal >= rightVal;
          case "==":
            return leftVal === rightVal;
          case "!=":
            return leftVal !== rightVal;
        }
      }
    }
    return false;
  }

  /**
   * Get value from data or parse as number
   */
  private _getValue(
    expr: string,
    data: Record<string, unknown>,
  ): number | null {
    // Try as field name
    const fieldName = expr.replace(/_/g, "_").toLowerCase();
    if (data[fieldName] !== undefined && data[fieldName] !== null) {
      return data[fieldName] as number;
    }

    // Try with underscores replaced
    const altName = expr.replace(/_/g, "");
    for (const [key, val] of Object.entries(data)) {
      if (key.toLowerCase() === altName && val !== null) {
        return val as number;
      }
    }

    // Try as number (handle M for million, K for thousand)
    const num = expr.replace(/m$/i, "000000").replace(/k$/i, "000");
    const parsed = parseFloat(num);
    if (!isNaN(parsed)) return parsed;

    return null;
  }

  private _requiresLocalCalc(condition: string): boolean {
    const localIndicators = ["supertrend", "t3", "tillson"];
    return localIndicators.some((ind) => condition.toLowerCase().includes(ind));
  }

  private _getRequiredHistoryLength(): Period {
    // Return a safe period for local calcs
    const interval = this._interval;
    if (interval.endsWith("m") || interval.endsWith("h")) return "1d";
    return "1y";
  }

  /**
   * Get current symbol universe
   */
  get symbols(): string[] {
    return [...this._symbols];
  }

  /**
   * Get current conditions
   */
  get conditions(): string[] {
    return [...this._conditions];
  }

  toString(): string {
    return `TechnicalScanner(symbols=${this._symbols.length}, conditions=${this._conditions.length}, interval='${this._interval}')`;
  }
}
