import { Interval, Period } from "~/types";

/**
 * Period mapping to number of days
 */
export const PERIOD_TO_DAYS: Record<string, number> = {
  "1d": 1,
  "5d": 5,
  "1w": 7,
  "1mo": 30,
  "3mo": 90,
  "6mo": 180,
  "1y": 365,
  "2y": 730,
  "5y": 1825,
  "10y": 3650,
  ytd: -1, // Special case - calculated from start of year
  max: -2, // Special case - all available data
  "1g": 1, // Turkish: 1 gün
  "5g": 5, // Turkish: 5 gün
  "1ay": 30, // Turkish: 1 ay
  "3ay": 90, // Turkish: 3 ay
  "1h": 7, // Turkish: 1 hafta
  "3h": 21, // Turkish: 3 hafta
};

/**
 * Cache TTL values (in seconds)
 */
export const TTL = {
  OHLCV_HISTORY: 3600, // 1 hour for historical data
  FX_RATES: 60, // 1 minute for current rates
  SEARCH: 86400, // 24 hours for search results
  FINANCIAL_STATEMENTS: 86400 * 30, // 30 days
  REALTIME_PRICE: 60, // 1 minute
  COMPANY_LIST: 86400, // 1 day
  VIOP: 300, // 5 minutes (derivatives data)
};

/**
 * Valid periods
 */
export const VALID_PERIODS: Period[] = [
  "1d",
  "5d",
  "1w",
  "1mo",
  "3mo",
  "6mo",
  "1y",
  "2y",
  "5y",
  "10y",
  "ytd",
  "max",
  "1g",
  "5g",
  "1ay",
  "3ay",
  "1h",
  "3h",
];

/**
 * Valid intervals
 */
export const VALID_INTERVALS: Interval[] = [
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
  "1mo",
];

/**
 * Interval to minutes mapping
 */
export const INTERVAL_TO_MINUTES: Record<string, number> = {
  "1m": 1,
  "3m": 3,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "45m": 45,
  "1h": 60,
  "4h": 240,
  "1d": 1440,
  "1w": 10080,
  "1mo": 43200,
};

/**
 * Parse date string or Date object to Date
 */
export function parseDate(date: string | Date): Date {
  if (date instanceof Date) {
    return date;
  }
  return new Date(date);
}

/**
 * Format date to YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Get start date for a period
 */
export function getStartDateForPeriod(period: Period, endDate?: Date): Date {
  const end = endDate || new Date();
  const days = PERIOD_TO_DAYS[period];

  if (days === -1) {
    // YTD - start of year
    return new Date(end.getFullYear(), 0, 1);
  } else if (days === -2) {
    // max - use a very old date
    return new Date(1990, 0, 1);
  } else {
    const start = new Date(end);
    start.setDate(start.getDate() - days);
    return start;
  }
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Clean symbol by removing suffixes
 */
export function cleanSymbol(symbol: string): string {
  return symbol.replace(/\.(IS|E)$/i, "").toUpperCase();
}

/**
 * Check if code is running in browser
 */
export function isBrowser(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    "window" in globalThis &&
    "document" in globalThis
  );
}

/**
 * Check if code is running in Node.js
 */
export function isNode(): boolean {
  return (
    typeof process !== "undefined" &&
    process.versions != null &&
    process.versions.node != null
  );
}

/**
 * Simple in-memory cache
 */
export class SimpleCache<T> {
  private cache: Map<string, { value: T; expiry: number }> = new Map();

  set(key: string, value: T, ttlSeconds: number = 300): void {
    const expiry = Date.now() + ttlSeconds * 1000;
    this.cache.set(key, { value, expiry });
  }

  get(key: string): T | undefined {
    const item = this.cache.get(key);
    if (!item) {
      return undefined;
    }

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return undefined;
    }

    return item.value;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  clear(): void {
    this.cache.clear();
  }

  delete(key: string): void {
    this.cache.delete(key);
  }
}

/**
 * Calculate percentage change
 */
export function calculatePercentChange(
  current: number,
  previous: number,
): number {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

/**
 * Round to specified decimal places
 */
export function roundTo(value: number, decimals: number = 2): number {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}
