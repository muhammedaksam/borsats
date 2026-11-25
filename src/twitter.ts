import { getKAPProvider } from "~/providers/kap";
import {
  clearTwitterAuth,
  getTwitterAuth,
  getTwitterProvider,
  setTwitterAuth,
  Tweet,
  TWEET_COLUMNS,
  TwitterAuthOptions,
  TwitterCredentials,
  TwitterSearchOptions,
} from "~/providers/twitter";

export {
  clearTwitterAuth,
  getTwitterAuth,
  setTwitterAuth,
  TWEET_COLUMNS,
  type Tweet,
  type TwitterAuthOptions,
  type TwitterCredentials,
  type TwitterSearchOptions,
};

export const FX_QUERY_MAP: Record<string, string> = {
  USD: "$USDTRY OR dolar kur OR dolar TL",
  EUR: "$EURTRY OR euro kur OR euro TL",
  GBP: "$GBPTRY OR sterlin kur",
  JPY: "japon yeni OR $JPYTRY",
  CHF: "isvicre frangi OR $CHFTRY",
  "gram-altin": "gram altin OR altin fiyat OR #altin",
  "ceyrek-altin": "ceyrek altin OR altin fiyat",
  "yarim-altin": "yarim altin OR altin fiyat",
  "tam-altin": "tam altin OR altin fiyat",
  "cumhuriyet-altin": "cumhuriyet altini OR altin fiyat",
  "ons-altin": "ons altin OR #gold OR $XAUUSD",
  "gram-gumus": "gram gumus OR gumus fiyat",
  BRENT: "brent petrol OR #brent OR $BRENT",
  XAU: "$XAUUSD OR #gold OR altin ons",
  XAG: "$XAGUSD OR gumus ons",
};

export const CRYPTO_QUERY_MAP: Record<string, string> = {
  BTC: "$BTC OR #Bitcoin",
  ETH: "$ETH OR #Ethereum",
  BNB: "$BNB OR #Binance",
  SOL: "$SOL OR #Solana",
  XRP: "$XRP OR #Ripple",
  DOGE: "$DOGE OR #Dogecoin",
  ADA: "$ADA OR #Cardano",
  AVAX: "$AVAX OR #Avalanche",
  DOT: "$DOT OR #Polkadot",
};

/**
 * Build a Twitter search query for a BIST stock (cashtag, hashtag, symbol, and KAP company name).
 */
export async function buildStockQuery(symbol: string): Promise<string> {
  const sym = symbol.toUpperCase();
  const parts = [`$${sym}`, `#${sym}`, sym];

  try {
    const matches = await getKAPProvider().search(sym);
    if (matches.length > 0 && matches[0].name) {
      let name = matches[0].name;
      for (const suffix of [" A.S.", " A.Ş.", " A.O.", " A.Ş"]) {
        name = name.replace(suffix, "");
      }
      name = name.trim();
      if (name) {
        parts.push(`"${name}"`);
      }
    }
  } catch {
    // KAP unavailable — fall back to symbol-only query
  }

  return parts.join(" OR ");
}

/**
 * Build a Twitter search query for a TEFAS mutual fund.
 */
export function buildFundQuery(code: string, name?: string | null): string {
  const clean = code.toUpperCase();
  const parts = [`#${clean}`, clean];

  if (name) {
    const shortName = name.slice(0, 60).trim();
    if (shortName) {
      parts.push(`"${shortName}"`);
    }
  }

  return parts.join(" OR ");
}

/**
 * Build a Twitter search query for an FX or commodity asset.
 */
export function buildFxQuery(asset: string): string {
  if (FX_QUERY_MAP[asset]) return FX_QUERY_MAP[asset];
  const upper = asset.toUpperCase();
  if (FX_QUERY_MAP[upper]) return FX_QUERY_MAP[upper];
  return `$${upper}TRY OR ${asset} kur`;
}

/**
 * Build a Twitter search query for a cryptocurrency pair (e.g., "BTCTRY").
 */
export function buildCryptoQuery(pair: string): string {
  const upper = pair.toUpperCase();
  let base = upper;
  for (const suffix of ["USDT", "TRY", "USD", "BTC", "ETH", "EUR"]) {
    if (upper.endsWith(suffix) && upper.length > suffix.length) {
      base = upper.slice(0, -suffix.length);
      break;
    }
  }

  if (CRYPTO_QUERY_MAP[base]) return CRYPTO_QUERY_MAP[base];
  return `$${base} OR #${base}`;
}

/**
 * Search Twitter/X for tweets matching a query.
 * Requires cookie authentication via `setTwitterAuth()`.
 */
export async function searchTweets(
  query: string,
  options: TwitterSearchOptions = {},
): Promise<Tweet[]> {
  return getTwitterProvider().searchTweets(query, options);
}
