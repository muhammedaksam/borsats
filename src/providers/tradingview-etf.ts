import { APIError } from "@/exceptions";
import { BaseProvider } from "@/providers/base";

export interface ETFHolder {
  symbol: string;
  exchange: string;
  name: string;
  market_cap_usd: number;
  holding_weight_pct: number;
  issuer: string;
  management: string;
  focus: string;
  expense_ratio: number;
  aum_usd: number;
  price: number;
  change_pct: number;
}

interface ScannerResponse {
  data: { d: (string | number | null)[] }[];
}

export class TradingViewETFProvider extends BaseProvider {
  private static readonly BASE_URL =
    "https://www.tradingview.com/etf-holdings/page-data";
  private static readonly SCANNER_URL =
    "https://scanner.tradingview.com/etf/scan";

  constructor() {
    super();
  }

  /**
   * Get ETFs holding a specific stock.
   */
  async getETFHolders(symbol: string): Promise<ETFHolder[]> {
    try {
      const payload = {
        filter: [
          {
            left: "holdings",
            operation: "has",
            right: symbol.toUpperCase(),
          },
        ],
        options: {
          lang: "en",
        },
        symbols: {
          query: {
            types: ["fund"],
          },
          tickers: [],
        },
        columns: [
          "name",
          "exchange",
          "description",
          "market_cap_basic",
          `fund_holding_weight;${symbol.toUpperCase()}`,
          "issuer",
          "management",
          "focus",
          "expense_ratio",
          "aum",
          "close",
          "change",
        ],
        sort: {
          sortBy: `fund_holding_weight;${symbol.toUpperCase()}`,
          sortOrder: "desc",
        },
        range: [0, 1000], // Initial range
      };

      const response = await this.client.post(
        TradingViewETFProvider.SCANNER_URL,
        payload,
      );
      const data = response.data as ScannerResponse;

      if (!data.data || !Array.isArray(data.data)) {
        return [];
      }

      return data.data.map((item) => {
        const d = item.d;
        // columns index mapping
        // 0: name (ticker?)
        // 1: exchange
        // 2: description (full name)
        // 3: market_cap
        // 4: weight
        // 5: issuer
        // 6: management
        // 7: focus
        // 8: expense_ratio
        // 9: aum
        // 10: close
        // 11: change

        return {
          symbol: String(d[0] || ""),
          exchange: String(d[1] || ""),
          name: String(d[2] || ""),
          market_cap_usd: typeof d[3] === "number" ? d[3] : 0,
          holding_weight_pct: typeof d[4] === "number" ? d[4] : 0,
          issuer: String(d[5] || ""),
          management: String(d[6] || ""),
          focus: String(d[7] || ""),
          expense_ratio: typeof d[8] === "number" ? d[8] : 0,
          aum_usd: typeof d[9] === "number" ? d[9] : 0,
          price: typeof d[10] === "number" ? d[10] : 0,
          change_pct: typeof d[11] === "number" ? d[11] : 0,
        };
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new APIError(`Failed to fetch ETF holders for ${symbol}: ${msg}`);
    }
  }
}

let _etfProvider: TradingViewETFProvider | null = null;

export function getTradingViewETFProvider(): TradingViewETFProvider {
  if (!_etfProvider) {
    _etfProvider = new TradingViewETFProvider();
  }
  return _etfProvider;
}
