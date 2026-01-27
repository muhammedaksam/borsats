import os from "os";
import { AxiosInstance } from "axios";
import WebSocket from "ws";

import { APIError, AuthenticationError } from "~/exceptions";
import { BaseProvider } from "~/providers/base";
import { CurrentData, OHLCVData } from "~/types";

// Module-level auth storage
let authCredentials: {
  session?: string;
  sessionSign?: string;
  authToken?: string;
  user?: Record<string, unknown>;
} | null = null;

/**
 * Set TradingView authentication credentials
 */
export async function setTradingViewAuth(options: {
  username?: string;
  password?: string;
  session?: string;
  sessionSign?: string;
}): Promise<typeof authCredentials> {
  const provider = getTradingViewProvider();

  if (options.username && options.password) {
    const userInfo = await provider.loginUser(
      options.username,
      options.password,
    );
    authCredentials = {
      session: userInfo.session,
      sessionSign: userInfo.sessionSign,
      authToken: userInfo.authToken,
      user: userInfo.user,
    };
  } else if (options.session) {
    authCredentials = {
      session: options.session,
      sessionSign: options.sessionSign,
      authToken: "unauthorized_user_token",
    };
  } else {
    throw new Error("Provide username/password or session/sessionSign");
  }

  return authCredentials;
}

/**
 * Clear TradingView authentication
 */
export function clearTradingViewAuth(): void {
  authCredentials = null;
}

/**
 * Get current auth credentials
 */
export function getTradingViewAuth(): typeof authCredentials {
  return authCredentials;
}

/**
 * TradingView WebSocket provider for real-time and historical data
 *
 * Based on TradingView's WebSocket protocol
 * Symbol format: BIST:THYAO, BIST:GARAN, etc.
 */
export class TradingViewProvider extends BaseProvider {
  private static readonly WS_URL =
    "wss://data.tradingview.com/socket.io/websocket";
  private static readonly ORIGIN = "https://www.tradingview.com";

  // Interval mapping to TradingView format
  private static readonly TIMEFRAMES: Record<string, string> = {
    "1m": "1",
    "5m": "5",
    "15m": "15",
    "30m": "30",
    "1h": "60",
    "4h": "240",
    "1d": "1D",
    "1w": "1W",
    "1wk": "1W",
    "1mo": "1M",
  };

  private static readonly PERIOD_DAYS: Record<string, number> = {
    "1d": 1,
    "5d": 5,
    "1mo": 30,
    "3mo": 90,
    "6mo": 180,
    "1y": 365,
    "2y": 730,
    "5y": 1825,
    "10y": 3650,
    ytd: 365,
    max: 3650,
  };

  constructor() {
    super({
      baseUrl: "https://www.tradingview.com",
    });
  }

  private getUserAgent(): string {
    const platform = os.platform();
    const release = os.release();
    return `borsats/1.0 (${platform} ${release})`;
  }

  /**
   * Login to TradingView and get session tokens
   */
  async loginUser(
    username: string,
    password: string,
    remember: boolean = true,
  ): Promise<{
    session: string;
    sessionSign: string;
    authToken: string;
    user: Record<string, unknown>;
  }> {
    const loginUrl = "https://www.tradingview.com/accounts/signin/";

    const headers = {
      "User-Agent": this.getUserAgent(),
      Origin: "https://www.tradingview.com",
      Referer: "https://www.tradingview.com/",
      "Content-Type": "application/x-www-form-urlencoded",
    };

    const data = new URLSearchParams({
      username,
      password,
      remember: remember ? "on" : "",
    });

    try {
      // Access client via cast to avoid TS issues if BaseProvider definitions are not fully resolved in all contexts
      interface ProviderWithClient {
        client: AxiosInstance;
      }
      const client = (this as unknown as ProviderWithClient).client;
      const response = await client.post(loginUrl, data, { headers });

      if (response.data && response.data.error) {
        throw new AuthenticationError(`Login failed: ${response.data.error}`);
      }

      // Extract cookies from set-cookie header
      const cookies = response.headers["set-cookie"] || [];
      let session = "";
      let sessionSign = "";

      cookies.forEach((cookie: string) => {
        if (typeof cookie === "string") {
          if (cookie.startsWith("sessionid=")) {
            session = cookie.split(";")[0].split("=")[1];
          } else if (cookie.startsWith("sessionid_sign=")) {
            sessionSign = cookie.split(";")[0].split("=")[1];
          }
        }
      });

      if (!session) {
        throw new AuthenticationError(
          "Login succeeded but no session cookie received",
        );
      }

      return {
        session,
        sessionSign,
        authToken: response.data.user?.auth_token || "unauthorized_user_token",
        user: response.data.user || {},
      };
    } catch (e) {
      if (e instanceof AuthenticationError) throw e;
      throw new AuthenticationError(
        `Login request failed: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Get authentication token
   */
  private getAuthToken(): string {
    if (authCredentials?.authToken) {
      return authCredentials.authToken;
    }
    return "unauthorized_user_token";
  }

  /**
   * Generate random session ID
   */
  private generateSessionId(prefix: string = "cs"): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let randomPart = "";
    for (let i = 0; i < 12; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${prefix}_${randomPart}`;
  }

  /**
   * Format data into TradingView packet: ~m~{length}~m~{data}
   */
  private formatPacket(data: string): string {
    return `~m~${data.length}~m~${data}`;
  }

  /**
   * Create TradingView WebSocket message
   */
  private createMessage(method: string, params: unknown[]): string {
    const msg = JSON.stringify({ m: method, p: params });
    return this.formatPacket(msg);
  }

  /**
   * Execute an operation with retry logic for 429 rate limits
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 1000,
  ): Promise<T> {
    let lastError: Error | null = null;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (e) {
        lastError = e as Error;
        if (
          lastError instanceof APIError &&
          (lastError.message.includes("429") ||
            lastError.message.includes("Timeout"))
        ) {
          const delay = baseDelay * Math.pow(2, i);
          console.warn(
            `TradingView request failed (${lastError.message}). Retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw e;
      }
    }
    throw lastError || new APIError("Failed after retries");
  }

  /**
   * Parse TradingView packets from raw message
   */
  private parsePackets(raw: string): Array<{ m?: string; p?: unknown[] }> {
    const packets: Array<{ m?: string; p?: unknown[] }> = [];
    const parts = raw.split(/~m~\d+~m~/);

    for (const part of parts) {
      if (!part || part.startsWith("~h~")) continue;
      try {
        packets.push(JSON.parse(part));
      } catch {
        // Ignore invalid JSON
      }
    }

    return packets;
  }

  /**
   * Calculate number of bars needed
   */
  private calculateBars(
    period: string,
    interval: string,
    start?: Date,
    end?: Date,
  ): number {
    let days: number;

    if (start && end) {
      days = Math.floor(
        (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
      );
    } else if (start) {
      days = Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24));
    } else if (period === "ytd") {
      const now = new Date();
      const yearStart = new Date(now.getFullYear(), 0, 1);
      days = Math.floor(
        (now.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24),
      );
    } else {
      days = TradingViewProvider.PERIOD_DAYS[period] || 30;
    }

    // Calculate bars based on interval
    const intervalMinutes: Record<string, number> = {
      "1m": 1,
      "5m": 5,
      "15m": 15,
      "30m": 30,
      "1h": 60,
      "4h": 240,
      "1d": 1440,
      "1w": 10080,
      "1wk": 10080,
      "1mo": 43200,
    };

    const minutes = intervalMinutes[interval] || 1440;
    const tradingMinutesPerDay = minutes < 1440 ? 510 : 1440; // BIST: 09:30-18:00

    const bars = Math.floor((days * tradingMinutesPerDay) / minutes);
    return Math.max(bars, 10);
  }

  /**
   * Get historical OHLCV data via WebSocket
   */
  async getHistory(options: {
    exchange: string;
    symbol: string;
    interval: string;
    start?: Date;
    end?: Date;
  }): Promise<OHLCVData[]> {
    return this.executeWithRetry(() => this._fetchHistory(options));
  }

  private async _fetchHistory(options: {
    exchange: string;
    symbol: string;
    interval: string;
    start?: Date;
    end?: Date;
  }): Promise<OHLCVData[]> {
    const { exchange, symbol, interval, start, end } = options;
    const endDt = end || new Date();
    const startDt = start || new Date(endDt.getTime() - 24 * 60 * 60 * 1000);

    // Map our interval format to TradingView format
    const tf = TradingViewProvider.TIMEFRAMES[interval] || "1D";

    // Calculate period/bars
    const bars = this.calculateBars("1mo", interval, startDt, endDt);

    const tvSymbol = `${exchange}:${symbol}`;
    const chartSession = this.generateSessionId("cs");

    return new Promise((resolve, reject) => {
      const periods: Record<number, OHLCVData> = {};
      let dataReceived = false;
      let errorMsg: string | null = null;

      const ws = new WebSocket(`${TradingViewProvider.WS_URL}?type=chart`, {
        headers: {
          Origin: TradingViewProvider.ORIGIN,
        },
      });

      const timeoutId = setTimeout(() => {
        if (!dataReceived) {
          cleanup();
          reject(new APIError("Timeout waiting for TradingView data"));
        }
      }, 15000);

      const cleanup = () => {
        clearTimeout(timeoutId);
        if (
          ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING
        ) {
          ws.close();
        }
      };

      ws.on("open", () => {
        // 1. Set auth token
        ws.send(this.createMessage("set_auth_token", [this.getAuthToken()]));

        // 2. Create chart session
        ws.send(this.createMessage("chart_create_session", [chartSession, ""]));

        // 3. Resolve symbol
        const symbolConfig = {
          symbol: tvSymbol,
          adjustment: "splits",
          session: "regular",
        };
        ws.send(
          this.createMessage("resolve_symbol", [
            chartSession,
            "ser_1",
            `=${JSON.stringify(symbolConfig)}`,
          ]),
        );

        // 4. Create series (request data)
        ws.send(
          this.createMessage("create_series", [
            chartSession,
            "$prices",
            "s1",
            "ser_1",
            tf,
            bars,
            "",
          ]),
        );
      });

      ws.on("message", (data: WebSocket.Data) => {
        const message = data.toString();
        const packets = this.parsePackets(message);

        for (const packet of packets) {
          const method = packet.m;
          const params = packet.p || [];

          if (method === "timescale_update") {
            if (params.length >= 2 && typeof params[1] === "object") {
              const seriesData = (params[1] as Record<string, unknown>)?.[
                "$prices"
              ] as Record<string, unknown>;
              const candles =
                (seriesData?.["s"] as Array<{ v?: number[] }>) || [];

              for (const candle of candles) {
                const v = candle.v;
                if (v && v.length >= 6) {
                  const timestamp = Math.floor(v[0]);
                  periods[timestamp] = {
                    date: new Date(timestamp * 1000),
                    open: v[1],
                    high: v[2],
                    low: v[3],
                    close: v[4],
                    volume: v[5],
                  };
                }
              }
              dataReceived = true;
            }
          } else if (method === "series_completed") {
            dataReceived = true;
            cleanup();

            const result = Object.values(periods).sort(
              (a, b) => a.date.getTime() - b.date.getTime(),
            );
            resolve(result);
          } else if (method === "critical_error" || method === "symbol_error") {
            errorMsg = JSON.stringify(params);
            cleanup();
            reject(new APIError(`TradingView error: ${errorMsg}`));
          }
        }
      });

      ws.on("error", (error) => {
        cleanup();
        reject(new APIError(`WebSocket error: ${error.message}`));
      });

      ws.on("close", () => {
        cleanup();
        if (!dataReceived && !errorMsg) {
          reject(new APIError("Connection closed before receiving data"));
        }
      });
    });
  }

  /**
   * Get current quote via WebSocket
   */
  async getCurrentQuote(
    exchange: string,
    symbol: string,
  ): Promise<CurrentData> {
    return this.executeWithRetry(() => this._fetchQuote(exchange, symbol));
  }

  private async _fetchQuote(
    exchange: string,
    symbol: string,
  ): Promise<CurrentData> {
    const tvSymbol = `${exchange}:${symbol}`;
    const quoteSession = this.generateSessionId("qs");

    return new Promise((resolve, reject) => {
      const rawData: Record<string, unknown> = {};
      let dataComplete = false;
      let errorMsg: string | null = null;

      const ws = new WebSocket(`${TradingViewProvider.WS_URL}?type=chart`, {
        headers: {
          Origin: TradingViewProvider.ORIGIN,
        },
      });

      const timeoutId = setTimeout(() => {
        if (!dataComplete) {
          cleanup();
          reject(new APIError("Timeout waiting for quote data"));
        }
      }, 10000);

      const cleanup = () => {
        clearTimeout(timeoutId);
        if (
          ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING
        ) {
          ws.close();
        }
      };

      ws.on("open", () => {
        // 1. Set auth token
        ws.send(this.createMessage("set_auth_token", [this.getAuthToken()]));

        // 2. Create quote session
        ws.send(this.createMessage("quote_create_session", [quoteSession]));

        // 3. Set fields
        const fields = [
          "lp",
          "ch",
          "chp",
          "open_price",
          "high_price",
          "low_price",
          "prev_close_price",
          "volume",
          "bid",
          "ask",
          "lp_time",
          "description",
          "currency_code",
        ];
        ws.send(
          this.createMessage("quote_set_fields", [quoteSession, ...fields]),
        );

        // 4. Add symbol
        ws.send(
          this.createMessage("quote_add_symbols", [quoteSession, tvSymbol]),
        );
      });

      ws.on("message", (data: WebSocket.Data) => {
        const message = data.toString();
        const packets = this.parsePackets(message);

        for (const packet of packets) {
          const method = packet.m;
          const params = packet.p || [];

          if (method === "qsd") {
            if (params.length >= 2 && typeof params[1] === "object") {
              const v = (params[1] as Record<string, unknown>).v as Record<
                string,
                unknown
              >;
              Object.assign(rawData, v);

              if ("lp" in rawData) {
                dataComplete = true;
                // Give a bit more time for additional data
                setTimeout(() => {
                  cleanup();

                  const quote: CurrentData = {
                    symbol,
                    last: rawData.lp as number,
                    change: rawData.ch as number,
                    changePercent: rawData.chp as number,
                    open: rawData.open_price as number,
                    high: rawData.high_price as number,
                    low: rawData.low_price as number,
                    close: rawData.prev_close_price as number,
                    volume: rawData.volume as number,
                    updateTime: new Date(),
                  };

                  resolve(quote);
                }, 200);
              }
            }
          } else if (method === "critical_error" || method === "symbol_error") {
            errorMsg = JSON.stringify(params);
            cleanup();
            reject(new APIError(`TradingView error: ${errorMsg}`));
          }
        }
      });

      ws.on("error", (error) => {
        cleanup();
        reject(new APIError(`WebSocket error: ${error.message}`));
      });

      ws.on("close", () => {
        cleanup();
        if (!dataComplete && !errorMsg) {
          reject(new APIError("Connection closed before receiving quote"));
        }
      });
    });
  }
}

// Singleton instance
let tvProvider: TradingViewProvider | null = null;

export function getTradingViewProvider(): TradingViewProvider {
  if (!tvProvider) {
    tvProvider = new TradingViewProvider();
  }
  return tvProvider;
}
