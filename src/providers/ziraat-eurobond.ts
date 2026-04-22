/**
 * Ziraat Bank Eurobond API provider
 *
 * Fetches Turkish sovereign Eurobond data from Ziraat Bank's API.
 * Includes USD and EUR denominated bonds with bid/ask prices and yields.
 */

import { BaseProvider } from "~/providers/base";
import { TTL } from "~/utils/helpers";

const ZIRAAT_URL =
  "https://www.ziraatbank.com.tr/tr/_layouts/15/Ziraat/FaizOranlari/Ajax.aspx/GetZBBonoTahvilOran";

export interface Eurobond {
  isin: string;
  maturity: Date | null;
  daysToMaturity: number;
  currency: string;
  bidPrice: number | null;
  bidYield: number | null;
  askPrice: number | null;
  askYield: number | null;
}

export interface EurobondHistoryRow {
  date: Date;
  bidPrice: number | null;
  bidYield: number | null;
  askPrice: number | null;
  askYield: number | null;
  daysToMaturity: number;
}

export class ZiraatEurobondProvider extends BaseProvider {
  private _cache: Eurobond[] | null = null;
  private _cacheTime: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Parse Turkish number format (comma as decimal separator)
   */
  private parseTurkishNumber(text: string): number | null {
    text = text.trim();
    if (!text || text === "-") return null;
    try {
      return parseFloat(text.replace(",", "."));
    } catch {
      return null;
    }
  }

  /**
   * Parse Ziraat date format (DD.MM.YYYY)
   */
  private parseDate(text: string): Date | null {
    text = text.trim();
    if (!text) return null;

    const match = text.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
    if (!match) return null;

    const [, day, month, year] = match;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  /**
   * Fetch bonds for a specific date
   */
  private async fetchBondsForDate(dateStr: string): Promise<Eurobond[]> {
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: "https://www.ziraatbank.com.tr",
      Referer: "https://www.ziraatbank.com.tr/tr/bireysel/yatirim/eurobond",
    };

    const payload = {
      kiymetTipi: "EURO",
      date: dateStr,
      hideIfStartWith: "",
    };

    try {
      const data = await this.request<{
        d?: { Data?: string };
      }>(ZIRAAT_URL, {
        method: "POST",
        data: payload,
        headers,
      });

      const html = data?.d?.Data || "";
      if (!html) return [];

      // Parse HTML table using regex (simplified)
      const bonds: Eurobond[] = [];
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;

      let rowMatch;
      let isHeader = true;

      while ((rowMatch = rowRegex.exec(html)) !== null) {
        if (isHeader) {
          isHeader = false;
          continue;
        }

        const cells: string[] = [];
        let cellMatch;
        while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
          // Strip HTML tags
          const text = cellMatch[1].replace(/<[^>]*>/g, "").trim();
          cells.push(text);
        }

        if (cells.length >= 8) {
          bonds.push({
            isin: cells[0],
            maturity: this.parseDate(cells[1]),
            daysToMaturity: parseInt(cells[2]) || 0,
            currency: cells[3],
            bidPrice: this.parseTurkishNumber(cells[4]),
            bidYield: this.parseTurkishNumber(cells[5]),
            askPrice: this.parseTurkishNumber(cells[6]),
            askYield: this.parseTurkishNumber(cells[7]),
          });
        }
      }

      return bonds;
    } catch {
      return [];
    }
  }

  /**
   * Check if bonds have valid yield data
   */
  private hasValidYields(bonds: Eurobond[]): boolean {
    return bonds.some(
      (b) => (b.bidYield && b.bidYield > 0) || (b.askYield && b.askYield > 0),
    );
  }

  /**
   * Get all Turkish Eurobonds
   */
  async getEurobonds(currency?: string): Promise<Eurobond[]> {
    const now = Date.now();

    // Check cache
    if (this._cache && now - this._cacheTime < this.CACHE_TTL) {
      const cached = this._cache;
      if (currency) {
        return cached.filter((b) => b.currency === currency.toUpperCase());
      }
      return cached;
    }

    // Try today first, then go back up to 7 days
    let bonds: Eurobond[] = [];

    for (let daysBack = 0; daysBack < 8; daysBack++) {
      const tryDate = new Date();
      tryDate.setDate(tryDate.getDate() - daysBack);
      const dateStr = tryDate.toISOString().split("T")[0];

      bonds = await this.fetchBondsForDate(dateStr);

      if (bonds.length > 0 && this.hasValidYields(bonds)) {
        break;
      }
    }

    // Cache result
    this._cache = bonds;
    this._cacheTime = now;

    if (currency) {
      return bonds.filter((b) => b.currency === currency.toUpperCase());
    }

    return bonds;
  }

  /**
   * Get single Eurobond by ISIN
   */
  async getEurobond(isin: string): Promise<Eurobond | null> {
    isin = isin.toUpperCase();
    const bonds = await this.getEurobonds();
    return bonds.find((b) => b.isin === isin) || null;
  }

  /**
   * Cached wrapper around fetchBondsForDate.
   * Historical daily data doesn't change, so it's safe to cache aggressively.
   */
  private async fetchBondsForDateCached(dateStr: string): Promise<Eurobond[]> {
    const cacheKey = `ziraat_eurobonds:${dateStr}`;
    const cached = this.cache.get(cacheKey) as Eurobond[] | undefined;
    if (cached) return cached;

    const bonds = await this.fetchBondsForDate(dateStr);
    this.cache.set(cacheKey, bonds, TTL.OHLCV_HISTORY);
    return bonds;
  }

  /**
   * Enumerate dates between start and end inclusive.
   * Weekdays only if skipWeekends is true.
   */
  static iterBusinessDates(
    start: Date,
    end: Date,
    skipWeekends: boolean = true,
  ): Date[] {
    if (end < start) return [];
    const dates: Date[] = [];
    const current = new Date(start);
    while (current <= end) {
      if (!skipWeekends || current.getDay() !== 0 && current.getDay() !== 6) {
        dates.push(new Date(current));
      }
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }

  /**
   * Fetch daily bond data for a single ISIN across a date range.
   *
   * @param isin - ISIN code (e.g., "US900123DG28")
   * @param start - Start date (inclusive)
   * @param end - End date (inclusive)
   * @param skipWeekends - Skip Saturdays/Sundays (API returns zeros)
   * @param maxWorkers - Concurrent request batch size
   * @returns List of EurobondHistoryRow sorted by date ascending.
   *          Rows where bidPrice is 0 or null are dropped.
   */
  async getHistory(
    isin: string,
    start: Date,
    end: Date,
    skipWeekends: boolean = true,
    maxWorkers: number = 5,
  ): Promise<EurobondHistoryRow[]> {
    isin = isin.toUpperCase();
    const dates = ZiraatEurobondProvider.iterBusinessDates(
      start,
      end,
      skipWeekends,
    );
    if (dates.length === 0) return [];

    const fetchOne = async (d: Date): Promise<EurobondHistoryRow | null> => {
      const dateStr = d.toISOString().split("T")[0];
      const bonds = await this.fetchBondsForDateCached(dateStr);
      for (const b of bonds) {
        if (b.isin === isin) {
          if (b.bidPrice === null || b.bidPrice === 0) return null;
          return {
            date: d,
            bidPrice: b.bidPrice,
            bidYield: b.bidYield,
            askPrice: b.askPrice,
            askYield: b.askYield,
            daysToMaturity: b.daysToMaturity,
          };
        }
      }
      return null;
    };

    // Concurrent fetch with bounded batch size
    const results: EurobondHistoryRow[] = [];
    const batchSize = Math.max(1, Math.min(maxWorkers, dates.length));

    for (let i = 0; i < dates.length; i += batchSize) {
      const batch = dates.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(fetchOne));
      for (const row of batchResults) {
        if (row !== null) {
          results.push(row);
        }
      }
    }

    results.sort((a, b) => a.date.getTime() - b.date.getTime());
    return results;
  }
}

let _provider: ZiraatEurobondProvider | null = null;

export function getEurobondProvider(): ZiraatEurobondProvider {
  if (!_provider) {
    _provider = new ZiraatEurobondProvider();
  }
  return _provider;
}
