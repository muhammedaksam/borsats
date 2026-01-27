import { searchCompanies } from "@/market";
import {
  getSearchProvider,
  SearchResult,
} from "@/providers/tradingview-search";
import { AssetType } from "@/types";

/**
 * Search results from different sources
 */
export interface UnifiedSearchResult {
  symbol: string;
  fullName: string;
  description: string;
  exchange: string;
  type: string;
  currency: string;
  country: string;
  source?: string;
}

/**
 * Unified symbol search across TradingView and KAP data
 */
export async function search(
  query: string,
  options: {
    type?: string;
    exchange?: string;
    limit?: number;
    fullInfo?: boolean;
  } = {},
): Promise<string[] | UnifiedSearchResult[]> {
  if (!query || !query.trim()) {
    throw new Error("Search query cannot be empty");
  }

  const { type, exchange, limit = 50, fullInfo = false } = options;

  const provider = getSearchProvider();

  // Integrated unified search logic
  const results = await provider.search(
    query,
    type as AssetType,
    exchange,
    limit,
  );

  let mergedResults: UnifiedSearchResult[] = results.map((r: SearchResult) => ({
    symbol: r.symbol,
    fullName: r.full_name || `${r.exchange}:${r.symbol}`,
    description: r.description,
    exchange: r.exchange,
    type: r.type,
    currency: r.currency,
    country: r.country,
    source: "tradingview",
  }));

  // Enhance with KAP data for BIST stocks if requested/applicable
  if (!type || type.toLowerCase() === "stock") {
    if (!exchange || exchange.toUpperCase() === "BIST") {
      try {
        const kapResults = await searchCompanies(query);
        if (kapResults.length > 0) {
          const tvSymbols = new Set(
            mergedResults.map((r) => r.symbol.toUpperCase()),
          );

          for (const company of kapResults) {
            const sym = company.ticker.toUpperCase();
            if (!tvSymbols.has(sym)) {
              mergedResults.push({
                symbol: sym,
                fullName: `BIST:${sym}`,
                description: company.name,
                exchange: "BIST",
                type: "stock",
                currency: "TRY",
                country: "TR",
                source: "kap",
              });
            }
          }
        }
      } catch {
        // Ignore KAP merge errors
      }
    }
  }

  if (fullInfo) {
    return mergedResults;
  }

  // Return unique symbols
  const seen = new Set<string>();
  const symbols: string[] = [];
  for (const r of mergedResults) {
    if (!seen.has(r.symbol)) {
      seen.add(r.symbol);
      symbols.push(r.symbol);
    }
  }
  return symbols;
}

/**
 * Search BIST symbols only
 */
export async function searchBist(
  query: string,
  limit: number = 50,
): Promise<string[]> {
  return search(query, { type: "stock", exchange: "BIST", limit }) as Promise<
    string[]
  >;
}

/**
 * Search cryptocurrency symbols
 */
export async function searchCrypto(
  query: string,
  limit: number = 50,
): Promise<string[]> {
  return search(query, { type: "crypto", limit }) as Promise<string[]>;
}

/**
 * Search forex symbols
 */
export async function searchForex(
  query: string,
  limit: number = 50,
): Promise<string[]> {
  return search(query, { type: "forex", limit }) as Promise<string[]>;
}

/**
 * Search market index symbols
 */
export async function searchIndex(
  query: string,
  limit: number = 50,
): Promise<string[]> {
  return search(query, { type: "index", limit }) as Promise<string[]>;
}
