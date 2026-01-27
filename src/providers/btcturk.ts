import { APIError, DataNotAvailableError } from "@/exceptions";
import { BaseProvider } from "@/providers/base";
import { CurrentData, OHLCVData } from "@/types";

/**
 * BTCTurk provider for cryptocurrency data
 */
export class BTCTurkProvider extends BaseProvider {
  private static readonly BASE_URL = "https://api.btcturk.com/api/v2";
  private static readonly GRAPH_API_URL = "https://graph-api.btcturk.com";

  // Resolution mapping (minutes)
  private static readonly RESOLUTION_MAP: Record<string, number> = {
    "1m": 1,
    "5m": 5,
    "15m": 15,
    "30m": 30,
    "1h": 60,
    "4h": 240,
    "1d": 1440,
    "1wk": 10080,
  };

  constructor() {
    super({
      baseUrl: BTCTurkProvider.BASE_URL,
    });
  }

  /**
   * Get current ticker data for a crypto pair
   */
  async getTicker(pair: string): Promise<CurrentData> {
    const pairUpper = pair.toUpperCase();
    const cacheKey = `btcturk:ticker:${pairUpper}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as CurrentData;
    }

    try {
      const url = `${BTCTurkProvider.BASE_URL}/ticker`;
      const response = await this.client.get(url, {
        params: { pairSymbol: pairUpper },
      });

      const data = response.data as { success: boolean; data: unknown };
      if (!data.success) {
        throw new APIError("BTCTurk API error");
      }

      const tickerData = Array.isArray(data.data) ? data.data[0] : data.data;
      const ticker = tickerData as Record<string, unknown>;

      const result: CurrentData = {
        symbol: ticker.pair as string,
        last: parseFloat(ticker.last as string),
        open: parseFloat(ticker.open as string),
        high: parseFloat(ticker.high as string),
        low: parseFloat(ticker.low as string),
        close: parseFloat(ticker.last as string),
        volume: parseFloat(ticker.volume as string),
        change: parseFloat(ticker.daily as string),
        changePercent: parseFloat(ticker.dailyPercent as string),
        updateTime: new Date(ticker.timestamp as number),
      };

      this.cache.set(cacheKey, result, 60); // TTL.REALTIME_PRICE (approx 60s)
      return result;
    } catch (e) {
      throw new APIError(
        `Failed to fetch BTCTurk ticker: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Get historical OHLCV data
   */
  async getHistory(options: {
    pair: string;
    interval: string;
    start?: Date;
    end?: Date;
  }): Promise<OHLCVData[]> {
    const { pair, interval, start, end } = options;
    const endDt = end || new Date();
    const startDt = start || new Date(endDt.getTime() - 24 * 60 * 60 * 1000); // 1d default?

    const fromTimestamp = Math.floor(startDt.getTime() / 1000);
    const toTimestamp = Math.floor(endDt.getTime() / 1000);
    const pairUpper = pair.toUpperCase();
    const cacheKey = `btcturk:history:${pairUpper}:${interval}:${fromTimestamp}:${toTimestamp}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as OHLCVData[];
    }

    try {
      const resolution = BTCTurkProvider.RESOLUTION_MAP[interval] || 1440;
      const url = `${BTCTurkProvider.GRAPH_API_URL}/v1/klines/history`;

      const response = await this.client.get(url, {
        params: {
          symbol: pairUpper,
          resolution,
          from: fromTimestamp,
          to: toTimestamp,
        },
      });

      const data = response.data as {
        s: string;
        t: number[];
        o: number[];
        h: number[];
        l: number[];
        c: number[];
        v: number[];
      };

      if (data.s !== "ok") {
        throw new DataNotAvailableError(`No data for ${pair}`);
      }

      const records: OHLCVData[] = [];
      for (let i = 0; i < data.t.length; i++) {
        records.push({
          date: new Date(data.t[i] * 1000),
          open: Number(data.o[i]) || 0,
          high: Number(data.h[i]) || 0,
          low: Number(data.l[i]) || 0,
          close: Number(data.c[i]) || 0,
          volume: Number(data.v[i]) || 0,
        });
      }

      this.cache.set(cacheKey, records, 3600); // TTL.OHLCV_HISTORY
      return records;
    } catch (e) {
      throw new APIError(
        `Failed to fetch BTCTurk history: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Get list of available trading pairs
   */
  async getPairs(quote: string = "TRY"): Promise<string[]> {
    const quoteUpper = quote.toUpperCase();
    const cacheKey = `btcturk:pairs:${quoteUpper}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as string[];
    }

    try {
      const url = `${BTCTurkProvider.BASE_URL}/ticker`;
      const response = await this.client.get(url);

      const data = response.data as {
        success: boolean;
        data: Array<{ pair: string }>;
      };
      if (!data.success) {
        return [];
      }

      const pairs = data.data
        .map((ticker) => ticker.pair)
        .filter((pair) => pair.endsWith(quoteUpper));

      this.cache.set(cacheKey, pairs, 86400); // TTL.COMPANY_LIST
      return pairs;
    } catch {
      return [];
    }
  }
}

// Singleton
let provider: BTCTurkProvider | null = null;

export function getBTCTurkProvider(): BTCTurkProvider {
  if (!provider) {
    provider = new BTCTurkProvider();
  }
  return provider;
}
