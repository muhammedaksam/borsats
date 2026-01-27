/**
 * Ziraat Bank Eurobond API provider
 *
 * Fetches Turkish sovereign Eurobond data from Ziraat Bank's API.
 * Includes USD and EUR denominated bonds with bid/ask prices and yields.
 */

import { BaseProvider } from "@/providers/base";

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
}

let _provider: ZiraatEurobondProvider | null = null;

export function getEurobondProvider(): ZiraatEurobondProvider {
  if (!_provider) {
    _provider = new ZiraatEurobondProvider();
  }
  return _provider;
}
