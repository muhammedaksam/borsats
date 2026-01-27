import { BaseProvider } from "@/providers/base";

export interface SearchResult {
  symbol: string;
  full_name: string;
  description: string;
  exchange: string;
  type: string;
  currency: string;
  country: string;
  provider_id?: string;
}

interface SearchResponseV3 {
  symbols: SearchSymbol[];
}
interface SearchSymbol {
  symbol: string;
  full_name?: string;
  description?: string;
  exchange?: string;
  type?: string;
  currency_code?: string;
  country?: string;
  provider_id?: string;
}

export class TradingViewSearchProvider extends BaseProvider {
  private static readonly SEARCH_URL_V3 =
    "https://symbol-search.tradingview.com/symbol_search/v3/";
  private static readonly SEARCH_URL_LEGACY =
    "https://symbol-search.tradingview.com/symbol_search/";
  private static readonly CACHE_TTL = 3600;

  private static readonly TYPE_MAPPING: Record<string, string> = {
    stock: "stock",
    forex: "forex",
    fx: "forex",
    crypto: "crypto",
    index: "index",
    futures: "futures",
    bond: "bond",
    fund: "fund",
    etf: "fund",
  };

  private static readonly EXCHANGE_MAPPING: Record<string, string> = {
    bist: "BIST",
    ist: "BIST",
    istanbul: "BIST",
    nasdaq: "NASDAQ",
    nyse: "NYSE",
    lse: "LSE",
    xetr: "XETR",
    amex: "AMEX",
  };

  private static readonly DEFAULT_LIMIT = 50;
  private static readonly MAX_LIMIT = 100;

  constructor() {
    super();
  }

  async search(
    query: string,
    assetType?: string,
    exchange?: string,
    limit?: number,
  ): Promise<SearchResult[]> {
    const lim = Math.min(
      limit || TradingViewSearchProvider.DEFAULT_LIMIT,
      TradingViewSearchProvider.MAX_LIMIT,
    );
    const q = query.trim();
    if (!q) return [];

    const cacheKey = `tv_search:${q}:${assetType || ""}:${exchange || ""}:${lim}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached as SearchResult[];

    const params: Record<string, string | number> = {
      text: q,
      start: 0,
    };

    if (exchange) {
      const norm =
        TradingViewSearchProvider.EXCHANGE_MAPPING[exchange.toLowerCase()] ||
        exchange.toUpperCase();
      params.exchange = norm;
    }

    if (assetType) {
      const norm =
        TradingViewSearchProvider.TYPE_MAPPING[assetType.toLowerCase()] ||
        assetType.toLowerCase();
      params.type = norm;
    }

    try {
      const data = await this._fetch(
        TradingViewSearchProvider.SEARCH_URL_V3,
        params,
      );
      const results = this._parseResults(data, lim);
      this.cache.set(cacheKey, results, TradingViewSearchProvider.CACHE_TTL);
      return results;
    } catch (e) {
      // Fallback
      try {
        const data = await this._fetch(
          TradingViewSearchProvider.SEARCH_URL_LEGACY,
          params,
        );
        const results = this._parseResults(data, lim);
        this.cache.set(cacheKey, results, TradingViewSearchProvider.CACHE_TTL);
        return results;
      } catch (e2) {
        return [];
      }
    }
  }

  async searchBist(query: string, limit?: number): Promise<SearchResult[]> {
    return this.search(query, "stock", "BIST", limit);
  }

  async searchCrypto(query: string, limit?: number): Promise<SearchResult[]> {
    return this.search(query, "crypto", undefined, limit);
  }

  async searchForex(query: string, limit?: number): Promise<SearchResult[]> {
    return this.search(query, "forex", undefined, limit);
  }

  private async _fetch(
    url: string,
    params: Record<string, string | number>,
  ): Promise<unknown> {
    const response = await this.client.get(url, {
      params,
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
        Origin: "https://www.tradingview.com",
        Referer: "https://www.tradingview.com/",
      },
    });
    return response.data;
  }

  private _parseResults(data: unknown, limit: number): SearchResult[] {
    let symbols: SearchSymbol[] = [];
    if (typeof data === "object" && data !== null) {
      if (
        "symbols" in data &&
        Array.isArray((data as SearchResponseV3).symbols)
      ) {
        symbols = (data as SearchResponseV3).symbols;
      } else if (Array.isArray(data)) {
        symbols = data as SearchSymbol[];
      }
    }

    const results: SearchResult[] = [];
    for (const item of symbols.slice(0, limit)) {
      if (!item || !item.symbol) continue;
      results.push({
        symbol: item.symbol,
        full_name: item.full_name || `${item.exchange}:${item.symbol}`,
        description: item.description || "",
        exchange: item.exchange || "",
        type: item.type || "stock",
        currency: item.currency_code || "",
        country: item.country || "",
        provider_id: item.provider_id,
      });
    }
    return results;
  }
}

let _searchProvider: TradingViewSearchProvider | null = null;
export function getSearchProvider(): TradingViewSearchProvider {
  if (!_searchProvider) _searchProvider = new TradingViewSearchProvider();
  return _searchProvider;
}
