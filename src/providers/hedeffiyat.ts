import { BaseProvider } from "@/providers/base";
import { TTL } from "@/utils/helpers";

export interface PriceTargets {
  current: number | null;
  low: number | null;
  high: number | null;
  mean: number | null;
  median: number | null;
  numberOfAnalysts: number | null;
}

export interface RecommendationSummary {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export class HedefFiyatProvider extends BaseProvider {
  private static readonly BASE_URL = "https://www.hedeffiyat.com.tr";
  private static readonly SEARCH_URL = "https://www.hedeffiyat.com.tr/arama";

  private urlCache: Map<string, string> = new Map();

  constructor() {
    super({
      baseUrl: "https://www.hedeffiyat.com.tr",
    });
  }

  /**
   * Get analyst price targets for a stock.
   *
   * @param symbol Stock symbol (e.g., "THYAO")
   * @returns Price target data
   */
  async getPriceTargets(symbol: string): Promise<PriceTargets> {
    const cleanSymbol = symbol
      .toUpperCase()
      .replace(".IS", "")
      .replace(".E", "");
    const cacheKey = `hedeffiyat_${cleanSymbol}`;

    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as PriceTargets;
    }

    const result: PriceTargets = {
      current: null,
      low: null,
      high: null,
      mean: null,
      median: null,
      numberOfAnalysts: null,
    };

    try {
      const pageUrl = await this._getStockUrl(cleanSymbol);
      if (!pageUrl) {
        return result;
      }

      const headers = {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Upgrade-Insecure-Requests": "1",
      };

      const response = await this.client.get(pageUrl, { headers });
      const html = response.data as string;

      if (!html) {
        return result;
      }

      const parsed = this._parsePriceTargets(html);

      if (parsed.numberOfAnalysts) {
        this.cache.set(cacheKey, parsed, TTL.COMPANY_LIST);
      }

      return parsed;
    } catch {
      return result;
    }
  }

  /**
   * Get analyst recommendation summary (buy/hold/sell counts).
   *
   * @param symbol Stock symbol (e.g., "THYAO")
   * @returns Recommendation counts
   */
  async getRecommendationsSummary(
    symbol: string,
  ): Promise<RecommendationSummary> {
    const cleanSymbol = symbol
      .toUpperCase()
      .replace(".IS", "")
      .replace(".E", "");
    const cacheKey = `hedeffiyat_recsummary_${cleanSymbol}`;

    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as RecommendationSummary;
    }

    const result: RecommendationSummary = {
      strongBuy: 0,
      buy: 0,
      hold: 0,
      sell: 0,
      strongSell: 0,
    };

    try {
      const pageUrl = await this._getStockUrl(cleanSymbol);
      if (!pageUrl) {
        return result;
      }

      const headers = {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
      };

      const response = await this.client.get(pageUrl, { headers });
      const html = response.data as string;

      if (!html) {
        return result;
      }

      // Parse recommendation buttons
      const pattern =
        /btn-sm\s+btn-(success|warning|danger|primary)[^>]*>([^<]+)<\/a/gi;
      let match;

      while ((match = pattern.exec(html)) !== null) {
        const btnClass = match[1].toLowerCase();
        const recText = match[2].trim().toLowerCase();

        // Map recommendation text to category
        if (recText.includes("güçlü al")) {
          result.strongBuy++;
        } else if (recText.includes("al") || recText.includes("endeks üstü")) {
          result.buy++;
        } else if (
          recText.includes("tut") ||
          recText.includes("nötr") ||
          recText.includes("endekse paralel")
        ) {
          result.hold++;
        } else if (recText.includes("güçlü sat")) {
          result.strongSell++;
        } else if (recText.includes("sat") || recText.includes("endeks altı")) {
          result.sell++;
        } else {
          // Fallback to button color
          if (btnClass === "success") {
            result.buy++;
          } else if (btnClass === "warning" || btnClass === "primary") {
            result.hold++;
          } else if (btnClass === "danger") {
            result.sell++;
          }
        }
      }

      if (Object.values(result).some((v) => v > 0)) {
        this.cache.set(cacheKey, result, TTL.COMPANY_LIST);
      }

      return result;
    } catch {
      return result;
    }
  }

  private async _getStockUrl(symbol: string): Promise<string | null> {
    if (this.urlCache.has(symbol)) {
      return this.urlCache.get(symbol)!;
    }

    try {
      const headers = {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Upgrade-Insecure-Requests": "1",
      };

      const response = await this.client.get(
        `${HedefFiyatProvider.BASE_URL}/senetler`,
        { headers },
      );

      if (!response.data) {
        return null;
      }

      const html = response.data as string;
      const pattern = new RegExp(
        `value="(/senet/${symbol.toLowerCase()}-[^"]+)"`,
        "i",
      );
      const match = html.match(pattern);

      if (match) {
        const url = `${HedefFiyatProvider.BASE_URL}${match[1]}`;
        this.urlCache.set(symbol, url);
        return url;
      }

      // Try search as fallback
      return this._searchStockUrl(symbol);
    } catch {
      return null;
    }
  }

  private async _searchStockUrl(symbol: string): Promise<string | null> {
    try {
      const headers = {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "tr-TR,tr;q=0.9",
      };

      const response = await this.client.get(HedefFiyatProvider.SEARCH_URL, {
        params: { q: symbol },
        headers,
      });

      if (!response.data) {
        return null;
      }

      const html = response.data as string;
      const pattern = new RegExp(
        `href="(/senet/${symbol.toLowerCase()}-[^"]+)"`,
        "i",
      );
      const match = html.match(pattern);

      if (match) {
        const url = `${HedefFiyatProvider.BASE_URL}${match[1]}`;
        this.urlCache.set(symbol, url);
        return url;
      }

      return null;
    } catch {
      return null;
    }
  }

  private _parsePriceTargets(html: string): PriceTargets {
    const result: PriceTargets = {
      current: null,
      low: null,
      high: null,
      mean: null,
      median: null,
      numberOfAnalysts: null,
    };

    try {
      // Current price
      const currentMatch = html.match(
        /Güncel\s*Fiyat.*?<strong[^>]*>\s*([\d.,]+)\s*₺/is,
      );
      if (currentMatch) {
        result.current = this._parseNumber(currentMatch[1]);
      }

      // Highest target
      const highMatch = html.match(
        /En\s*Yüksek\s*Tahmin<\/div>\s*<div[^>]*>\s*([\d.,]+)\s*₺/is,
      );
      if (highMatch) {
        result.high = this._parseNumber(highMatch[1]);
      }

      // Lowest target
      const lowMatch = html.match(
        /En\s*Düşük\s*Tahmin<\/div>\s*<div[^>]*>\s*([\d.,]+)\s*₺/is,
      );
      if (lowMatch) {
        result.low = this._parseNumber(lowMatch[1]);
      }

      // Average price
      const avgMatch = html.match(
        /Ortalama\s*Fiyat\s*Tahmini<\/div>\s*<div[^>]*>\s*([\d.,]+)\s*₺/is,
      );
      if (avgMatch) {
        result.mean = this._parseNumber(avgMatch[1]);
      }

      // Analyst count
      const countMatch = html.match(
        /Kurum\s*Sayısı.*?<strong[^>]*>\s*(\d+)\s*<\/strong>/is,
      );
      if (countMatch) {
        result.numberOfAnalysts = parseInt(countMatch[1], 10);
      }

      // Calculate median from low and high if available
      if (result.low !== null && result.high !== null) {
        result.median =
          Math.round(((result.low + result.high) / 2) * 100) / 100;
      }

      return result;
    } catch {
      return result;
    }
  }

  private _parseNumber(text: string): number | null {
    if (!text) return null;

    try {
      const cleaned = text.trim();

      // Turkish format: 1.234,56 -> 1234.56
      if (cleaned.includes(",") && cleaned.includes(".")) {
        return parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
      } else if (cleaned.includes(",")) {
        return parseFloat(cleaned.replace(",", "."));
      }

      return parseFloat(cleaned);
    } catch {
      return null;
    }
  }
}

// Singleton
let provider: HedefFiyatProvider | null = null;

export function getHedefFiyatProvider(): HedefFiyatProvider {
  if (!provider) {
    provider = new HedefFiyatProvider();
  }
  return provider;
}
