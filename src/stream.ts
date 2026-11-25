import { EventEmitter } from "events";
import WebSocket from "ws";

import {
  getPineFacadeProvider,
  INDICATOR_OUTPUTS,
  IndicatorMetadata,
} from "~/providers/pine-facade";
import { getTradingViewAuth } from "~/providers/tradingview";

export interface Quote {
  symbol: string;
  [key: string]: unknown;
}

interface TradingViewPacket {
  m: string;
  p: unknown[];
}

interface StudyDataPoint {
  v: number[];
}

interface StudyUpdateData {
  st?: StudyDataPoint[];
  s?: StudyDataPoint[];
}

type TvInputType = string | number | boolean | Record<string, unknown>;

/**
 * Pine Script study configuration
 */
export interface PineStudy {
  indicatorId: string;
  studyId: string;
  symbol: string;
  interval: string;
  inputs: Record<string, unknown>;
  metadata: IndicatorMetadata;
  values: Record<string, number>;
  ready: boolean;
}

/**
 * Manages Pine Script studies (indicators) on a TradingViewStream
 */
export class StudySession {
  private _stream: TradingViewStream;
  private _studies: Map<string, Map<string, Map<string, PineStudy>>> =
    new Map();
  private _studyCounter = 0;
  private _studyIdMap: Map<
    string,
    { symbol: string; interval: string; indicator: string }
  > = new Map();

  constructor(stream: TradingViewStream) {
    this._stream = stream;
  }

  /**
   * Add a study to the session
   */
  async add(
    symbol: string,
    interval: string,
    indicator: string,
    inputs: Record<string, unknown> = {},
  ): Promise<string> {
    const s = symbol.toUpperCase();
    const i = interval.toLowerCase();

    // Normalize indicator
    const pineFacade = getPineFacadeProvider();
    const metadata = await pineFacade.getIndicator(indicator);
    const indicatorId = metadata.pineId;
    const displayName = indicator.toUpperCase();

    const studyId = `st${++this._studyCounter}`;
    const study: PineStudy = {
      indicatorId,
      studyId,
      symbol: s,
      interval: i,
      inputs,
      metadata,
      values: {},
      ready: false,
    };

    if (!this._studies.has(s)) this._studies.set(s, new Map());
    if (!this._studies.get(s)!.has(i)) this._studies.get(s)!.set(i, new Map());
    this._studies.get(s)!.get(i)!.set(displayName, study);
    this._studyIdMap.set(studyId, {
      symbol: s,
      interval: i,
      indicator: displayName,
    });

    // Send create_study message (simplified logic for now)
    this._stream.send("create_study", [
      this._stream.chartSession,
      studyId,
      "st1",
      "$prices",
      "Script@tv-scripting-101!",
      this._buildTvInputs(study),
    ]);

    return studyId;
  }

  /**
   * Get latest study values
   */
  get(
    symbol: string,
    interval: string,
    indicator: string,
  ): Record<string, number> | null {
    const s = symbol.toUpperCase();
    const i = interval.toLowerCase();
    const displayName = indicator.toUpperCase();
    return this._studies.get(s)?.get(i)?.get(displayName)?.values || null;
  }

  /**
   * Handle incoming study data
   */
  handleData(studyId: string, data: StudyUpdateData) {
    const map = this._studyIdMap.get(studyId);
    if (!map) return;

    const study = this._studies
      .get(map.symbol)
      ?.get(map.interval)
      ?.get(map.indicator);
    if (!study) return;

    const values: Record<string, number> = {};
    const outputMapping = INDICATOR_OUTPUTS[study.indicatorId] || {
      plot_0: "value",
    };

    const stData = data.st || data.s || [];
    if (Array.isArray(stData) && stData.length > 0) {
      const latest = stData[stData.length - 1];
      const v = latest.v;
      if (v && v.length >= 2) {
        Object.keys(outputMapping).forEach((plotId) => {
          const idx = parseInt(plotId.split("_")[1]) + 1;
          if (idx < v.length) {
            values[outputMapping[plotId]] = v[idx];
          }
        });
      }
    }

    if (Object.keys(values).length > 0) {
      study.values = values;
      study.ready = true;
      this._stream.emit("study", {
        symbol: map.symbol,
        interval: map.interval,
        indicator: map.indicator,
        values,
      });
    }
  }

  /**
   * Handle study_loading protocol event
   */
  handleStudyLoading(studyId: string): void {
    const map = this._studyIdMap.get(studyId);
    if (!map) return;
    this._stream.emit("study_loading", {
      studyId,
      symbol: map.symbol,
      interval: map.interval,
      indicator: map.indicator,
    });
  }

  /**
   * Handle study_completed protocol event
   */
  handleStudyCompleted(studyId: string): void {
    const map = this._studyIdMap.get(studyId);
    if (!map) return;
    const study = this._studies
      .get(map.symbol)
      ?.get(map.interval)
      ?.get(map.indicator);
    if (study) {
      study.ready = true;
    }
    this._stream.emit("study_completed", {
      studyId,
      symbol: map.symbol,
      interval: map.interval,
      indicator: map.indicator,
    });
  }

  /**
   * Handle study_error protocol event
   */
  handleStudyError(studyId: string, error: string): void {
    const map = this._studyIdMap.get(studyId);
    this._stream.emit("study_error", {
      studyId,
      symbol: map?.symbol,
      interval: map?.interval,
      indicator: map?.indicator,
      error,
    });
  }

  private _buildTvInputs(study: PineStudy): Record<string, TvInputType> {
    const inputs: Record<string, TvInputType> = {
      pineId: study.indicatorId,
      pineVersion: "last",
    };
    const merged = { ...study.metadata.defaults, ...study.inputs };
    Object.keys(merged).forEach((key, idx) => {
      const val = merged[key];
      let type = "string";
      if (typeof val === "boolean") type = "boolean";
      else if (typeof val === "number")
        type = Number.isInteger(val) ? "integer" : "float";

      inputs[`in_${idx}`] = {
        v: val as string | number | boolean,
        f: true,
        t: type,
      };
    });
    return inputs;
  }

  /**
   * Remove a study from the session
   */
  remove(symbol: string, interval: string, indicator: string): void {
    const s = symbol.toUpperCase();
    const i = interval.toLowerCase();
    const displayName = indicator.toUpperCase();

    const study = this._studies.get(s)?.get(i)?.get(displayName);
    if (!study) return;

    // Remove from maps
    this._studies.get(s)?.get(i)?.delete(displayName);
    this._studyIdMap.delete(study.studyId);

    // Clean up empty maps
    if (this._studies.get(s)?.get(i)?.size === 0) {
      this._studies.get(s)?.delete(i);
    }
    if (this._studies.get(s)?.size === 0) {
      this._studies.delete(s);
    }

    // Send remove_study message
    this._stream.send("remove_study", [
      this._stream.chartSession,
      study.studyId,
    ]);
  }

  /**
   * Get all study values for a symbol/interval
   */
  getAll(
    symbol: string,
    interval: string,
  ): Record<string, Record<string, number>> {
    const s = symbol.toUpperCase();
    const i = interval.toLowerCase();
    const result: Record<string, Record<string, number>> = {};

    const intervalMap = this._studies.get(s)?.get(i);
    if (!intervalMap) return result;

    intervalMap.forEach((study, name) => {
      if (study.values && Object.keys(study.values).length > 0) {
        result[name] = { ...study.values };
      }
    });

    return result;
  }

  /**
   * Wait for study data (blocking with timeout)
   */
  async waitFor(
    symbol: string,
    interval: string,
    indicator: string,
    timeout: number = 10000,
  ): Promise<Record<string, number>> {
    const s = symbol.toUpperCase();
    const i = interval.toLowerCase();
    const displayName = indicator.toUpperCase();

    // Check if already have data
    const existing = this.get(s, i, displayName);
    if (existing && Object.keys(existing).length > 0) {
      return existing;
    }

    // Wait for study event
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this._stream.off("study", handler);
        reject(
          new Error(`Timeout waiting for study: ${s} ${i} ${displayName}`),
        );
      }, timeout);

      const handler = (data: {
        symbol: string;
        interval: string;
        indicator: string;
        values: Record<string, number>;
      }) => {
        if (
          data.symbol === s &&
          data.interval === i &&
          data.indicator === displayName
        ) {
          clearTimeout(timeoutId);
          this._stream.off("study", handler);
          resolve(data.values);
        }
      };

      this._stream.on("study", handler);
    });
  }

  /**
   * Register callback for specific study updates
   */
  onUpdate(
    symbol: string,
    interval: string,
    indicator: string,
    callback: (values: Record<string, number>) => void,
  ): void {
    const s = symbol.toUpperCase();
    const i = interval.toLowerCase();
    const displayName = indicator.toUpperCase();

    this._stream.on(
      "study",
      (data: {
        symbol: string;
        interval: string;
        indicator: string;
        values: Record<string, number>;
      }) => {
        if (
          data.symbol === s &&
          data.interval === i &&
          data.indicator === displayName
        ) {
          callback(data.values);
        }
      },
    );
  }

  /**
   * Register callback for any study update
   */
  onAnyUpdate(
    callback: (
      symbol: string,
      interval: string,
      indicator: string,
      values: Record<string, number>,
    ) => void,
  ): void {
    this._stream.on(
      "study",
      (data: {
        symbol: string;
        interval: string;
        indicator: string;
        values: Record<string, number>;
      }) => {
        callback(data.symbol, data.interval, data.indicator, data.values);
      },
    );
  }
}

/**
 * OHLCV candle data
 */
export interface StreamCandle {
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ChartUpdateData {
  s?: Array<{ v: number[] }>;
  st?: Array<{ v: number[] }>;
}

interface ChartSubscription {
  seriesId: string;
  resolveId: string;
  symbol: string;
  interval: string;
}

/**
 * Persistent WebSocket streaming for real-time data
 */
export class TradingViewStream extends EventEmitter {
  public static readonly WS_URL =
    "wss://data.tradingview.com/socket.io/websocket";
  public static readonly ORIGIN = "https://www.tradingview.com";
  public static readonly MAX_RECONNECT_ATTEMPTS = 10;
  public static readonly MAX_RECONNECT_DELAY = 30;
  public static readonly HEARTBEAT_INTERVAL = 30;

  private ws: WebSocket | null = null;
  private _isConnected = false;
  private _authToken: string | undefined;
  private _quoteSession: string;
  private _chartSession: string;
  private _subscribedSymbols: Set<string> = new Set();
  private _chartSubscriptions: Map<string, ChartSubscription> = new Map();
  private _seriesIdMap: Map<string, { symbol: string; interval: string }> =
    new Map();
  private _candleCache: Map<string, StreamCandle[]> = new Map();
  private _quoteCache: Map<string, Quote> = new Map();
  private _quoteCallbacks: Map<
    string,
    Map<(quote: Quote) => void, (quote: Quote) => void>
  > = new Map();
  private _candleCallbacks: Map<
    string,
    Map<
      (candle: StreamCandle) => void,
      (data: { symbol: string; interval: string; candle: StreamCandle }) => void
    >
  > = new Map();
  private _seriesCounter = 0;
  private _shouldReconnect = true;
  private _reconnecting = false;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _heartbeatCounter = 0;

  public readonly studies: StudySession;

  constructor(authToken?: string) {
    super();
    this._authToken = authToken;
    this._quoteSession = "qs_" + this._generateId();
    this._chartSession = "cs_" + this._generateId();
    this.studies = new StudySession(this);
  }

  get chartSession() {
    return this._chartSession;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  get subscribedSymbols(): string[] {
    return Array.from(this._subscribedSymbols);
  }

  get chartSubscriptions(): Array<{ symbol: string; interval: string }> {
    return Array.from(this._chartSubscriptions.values()).map((sub) => ({
      symbol: sub.symbol,
      interval: sub.interval,
    }));
  }

  async connect(timeout: number = 10000): Promise<void> {
    if (this._isConnected) return;

    this._shouldReconnect = true;

    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error(`Connection timeout after ${timeout}ms`));
        }
      }, timeout);
      timer.unref?.();

      this.ws = new WebSocket(TradingViewStream.WS_URL, {
        headers: { Origin: TradingViewStream.ORIGIN },
      });

      this.ws.on("open", () => {
        clearTimeout(timer);
        this._isConnected = true;
        const auth = getTradingViewAuth();
        this.send("set_auth_token", [
          this._authToken || auth?.authToken || "unauthorized_user_token",
        ]);

        // Setup sessions
        this.send("quote_create_session", [this._quoteSession]);
        this.send("quote_set_fields", [
          this._quoteSession,
          "lp",
          "ch",
          "chp",
          "status",
          "symbol",
          "description",
          "volume",
          "open_price",
          "high_price",
          "low_price",
        ]);

        this.send("chart_create_session", [this._chartSession, ""]);

        if (!settled) {
          settled = true;
          resolve();
        }
      });

      this.ws.on("message", (data) => this._parseMessage(data.toString()));
      this.ws.on("error", (err) => {
        clearTimeout(timer);
        this.emit("error", err);
        if (!settled) {
          settled = true;
          reject(err);
        }
      });
      this.ws.on("close", () => {
        clearTimeout(timer);
        this._isConnected = false;
        this.emit("close");
        if (this._shouldReconnect && !this._reconnecting) {
          void this._reconnect();
        }
      });
    });
  }

  disconnect() {
    this._shouldReconnect = false;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._isConnected = false;
  }

  subscribe(symbol: string, exchange: string = "BIST") {
    const s = `${exchange}:${symbol.toUpperCase()}`;
    if (this._subscribedSymbols.has(s)) return;

    this.send("quote_add_symbols", [this._quoteSession, s]);
    this._subscribedSymbols.add(s);
  }

  unsubscribe(symbol: string, exchange: string = "BIST") {
    const s = `${exchange}:${symbol.toUpperCase()}`;
    this.send("quote_remove_symbols", [this._quoteSession, s]);
    this._subscribedSymbols.delete(s);
    this._quoteCache.delete(s);
  }

  /**
   * Get cached quote (instant)
   */
  getQuote(symbol: string, exchange: string = "BIST"): Quote | null {
    const s = `${exchange}:${symbol.toUpperCase()}`;
    return this._quoteCache.get(s) || null;
  }

  /**
   * Get all cached quotes as a symbol -> Quote map
   */
  getAllQuotes(): Record<string, Quote> {
    const result: Record<string, Quote> = {};
    this._quoteCache.forEach((quote, key) => {
      result[key] = quote;
    });
    return result;
  }

  /**
   * Wait for first quote (blocking)
   */
  async waitForQuote(
    symbol: string,
    exchange: string = "BIST",
    timeout: number = 10000,
  ): Promise<Quote> {
    const s = `${exchange}:${symbol.toUpperCase()}`;

    // Check cache first
    const cached = this._quoteCache.get(s);
    if (cached) return cached;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.off("quote", handler);
        reject(new Error(`Timeout waiting for quote: ${s}`));
      }, timeout);

      const handler = (quote: Quote) => {
        if (quote.symbol === s) {
          clearTimeout(timeoutId);
          this.off("quote", handler);
          resolve(quote);
        }
      };

      this.on("quote", handler);
    });
  }

  /**
   * Subscribe to multiple symbols at once
   */
  subscribeMultiple(symbols: string[], exchange: string = "BIST"): void {
    for (const symbol of symbols) {
      this.subscribe(symbol, exchange);
    }
  }

  /**
   * Unsubscribe from multiple symbols at once
   */
  unsubscribeMultiple(symbols: string[], exchange: string = "BIST"): void {
    for (const symbol of symbols) {
      this.unsubscribe(symbol, exchange);
    }
  }

  /**
   * Register callback for ALL quote updates (any symbol)
   */
  onAnyQuote(callback: (quote: Quote) => void): void {
    this.on("quote", callback);
  }

  /**
   * Register callback for ALL candle updates (any symbol/interval)
   */
  onAnyCandle(
    callback: (data: {
      symbol: string;
      interval: string;
      candle: StreamCandle;
    }) => void,
  ): void {
    this.on("candle", callback);
  }

  /**
   * Subscribe to OHLCV candle updates
   */
  subscribeChart(
    symbol: string,
    interval: string = "1m",
    exchange: string = "BIST",
  ) {
    const s = `${exchange}:${symbol.toUpperCase()}`;
    const key = `${s}:${interval}`;
    if (this._chartSubscriptions.has(key)) return;

    const seriesId = `s${++this._seriesCounter}`;
    const resolveId = `ser_${this._seriesCounter}`;

    // Resolve symbol
    this.send("resolve_symbol", [
      this._chartSession,
      resolveId,
      `={"symbol":"${s}","adjustment":"splits","session":"regular"}`,
    ]);

    // Create series
    const tf = CHART_TIMEFRAMES[interval] || "1D";
    this.send("create_series", [
      this._chartSession,
      seriesId,
      "s1",
      resolveId,
      tf,
      300,
      "",
    ]);

    this._chartSubscriptions.set(key, {
      seriesId,
      resolveId,
      symbol: s,
      interval,
    });
    this._seriesIdMap.set(seriesId, { symbol: s, interval });
  }

  /**
   * Unsubscribe from chart updates
   */
  unsubscribeChart(
    symbol: string,
    interval: string,
    exchange: string = "BIST",
  ) {
    const s = `${exchange}:${symbol.toUpperCase()}`;
    const key = `${s}:${interval}`;
    const sub = this._chartSubscriptions.get(key);
    if (!sub) return;

    this.send("remove_series", [this._chartSession, sub.seriesId]);
    this._chartSubscriptions.delete(key);
    this._seriesIdMap.delete(sub.seriesId);
    this._candleCache.delete(key);
  }

  /**
   * Get latest cached candle (instant)
   */
  getCandle(
    symbol: string,
    interval: string,
    exchange: string = "BIST",
  ): StreamCandle | null {
    const s = `${exchange}:${symbol.toUpperCase()}`;
    const key = `${s}:${interval}`;
    const candles = this._candleCache.get(key);
    if (!candles || candles.length === 0) return null;
    return candles[candles.length - 1];
  }

  /**
   * Get cached candles
   */
  getCandles(
    symbol: string,
    interval: string,
    count?: number,
    exchange: string = "BIST",
  ): StreamCandle[] {
    const s = `${exchange}:${symbol.toUpperCase()}`;
    const key = `${s}:${interval}`;
    const candles = this._candleCache.get(key) || [];
    if (count) return candles.slice(-count);
    return [...candles];
  }

  /**
   * Wait for first candle (blocking)
   */
  async waitForCandle(
    symbol: string,
    interval: string,
    timeout: number = 5000,
    exchange: string = "BIST",
  ): Promise<StreamCandle> {
    const s = `${exchange}:${symbol.toUpperCase()}`;
    const key = `${s}:${interval}`;

    // Check if already have data
    const existing = this.getCandle(symbol, interval, exchange);
    if (existing) return existing;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.off("candle", handler);
        reject(new Error(`Timeout waiting for candle: ${key}`));
      }, timeout);

      const handler = (data: {
        symbol: string;
        interval: string;
        candle: StreamCandle;
      }) => {
        if (data.symbol === s && data.interval === interval) {
          clearTimeout(timeoutId);
          this.off("candle", handler);
          resolve(data.candle);
        }
      };

      this.on("candle", handler);
    });
  }

  /**
   * Register callback for quote updates
   */
  onQuote(
    symbol: string,
    callback: (quote: Quote) => void,
    exchange: string = "BIST",
  ) {
    const s = `${exchange}:${symbol.toUpperCase()}`;
    const wrapper = (quote: Quote) => {
      if (quote.symbol === s) callback(quote);
    };
    if (!this._quoteCallbacks.has(s)) {
      this._quoteCallbacks.set(s, new Map());
    }
    this._quoteCallbacks.get(s)!.set(callback, wrapper);
    this.on("quote", wrapper);
  }

  /**
   * Remove a previously registered quote callback
   */
  removeCallback(
    symbol: string,
    callback: (quote: Quote) => void,
    exchange: string = "BIST",
  ): void {
    const s = `${exchange}:${symbol.toUpperCase()}`;
    const wrapper = this._quoteCallbacks.get(s)?.get(callback);
    if (wrapper) {
      this.off("quote", wrapper);
      this._quoteCallbacks.get(s)!.delete(callback);
    }
  }

  /**
   * Register callback for candle updates
   */
  onCandle(
    symbol: string,
    interval: string,
    callback: (candle: StreamCandle) => void,
    exchange: string = "BIST",
  ) {
    const s = `${exchange}:${symbol.toUpperCase()}`;
    const key = `${s}:${interval}`;
    const wrapper = (data: {
      symbol: string;
      interval: string;
      candle: StreamCandle;
    }) => {
      if (data.symbol === s && data.interval === interval) {
        callback(data.candle);
      }
    };
    if (!this._candleCallbacks.has(key)) {
      this._candleCallbacks.set(key, new Map());
    }
    this._candleCallbacks.get(key)!.set(callback, wrapper);
    this.on("candle", wrapper);
  }

  /**
   * Remove a previously registered candle callback
   */
  removeCandleCallback(
    symbol: string,
    interval: string,
    callback: (candle: StreamCandle) => void,
    exchange: string = "BIST",
  ): void {
    const s = `${exchange}:${symbol.toUpperCase()}`;
    const key = `${s}:${interval}`;
    const wrapper = this._candleCallbacks.get(key)?.get(callback);
    if (wrapper) {
      this.off("candle", wrapper);
      this._candleCallbacks.get(key)!.delete(callback);
    }
  }

  // --- Study convenience wrappers (aligned with borsapy TradingViewStream) ---

  addStudy(
    symbol: string,
    interval: string,
    indicator: string,
    inputs: Record<string, unknown> = {},
  ): Promise<string> {
    return this.studies.add(symbol, interval, indicator, inputs);
  }

  removeStudy(symbol: string, interval: string, indicator: string): void {
    this.studies.remove(symbol, interval, indicator);
  }

  getStudy(
    symbol: string,
    interval: string,
    indicator: string,
  ): Record<string, number> | null {
    return this.studies.get(symbol, interval, indicator);
  }

  getStudies(
    symbol: string,
    interval: string,
  ): Record<string, Record<string, number>> {
    return this.studies.getAll(symbol, interval);
  }

  onStudy(
    symbol: string,
    interval: string,
    indicator: string,
    callback: (values: Record<string, number>) => void,
  ): void {
    this.studies.onUpdate(symbol, interval, indicator, callback);
  }

  onAnyStudy(
    callback: (
      symbol: string,
      interval: string,
      indicator: string,
      values: Record<string, number>,
    ) => void,
  ): void {
    this.studies.onAnyUpdate(callback);
  }

  waitForStudy(
    symbol: string,
    interval: string,
    indicator: string,
    timeout: number = 10000,
  ): Promise<Record<string, number>> {
    return this.studies.waitFor(symbol, interval, indicator, timeout);
  }

  /**
   * Send a heartbeat ping packet over the active WebSocket.
   */
  ping(): void {
    if (!this.ws || !this._isConnected) return;
    const hb = `~h~${++this._heartbeatCounter}`;
    this.ws.send(`~m~${hb.length}~m~${hb}`);
  }

  /**
   * Block until the stream disconnects (or optional AbortSignal fires).
   */
  wait(signal?: AbortSignal): Promise<void> {
    if (!this._isConnected && !this._reconnecting) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const cleanup = () => {
        this.off("close", onClose);
        this.off("reconnect_failed", onDone);
        signal?.removeEventListener("abort", onDone);
      };
      const onDone = () => {
        cleanup();
        resolve();
      };
      const onClose = () => {
        if (!this._shouldReconnect) {
          onDone();
        }
      };
      this.on("close", onClose);
      this.on("reconnect_failed", onDone);
      if (signal) {
        if (signal.aborted) {
          onDone();
          return;
        }
        signal.addEventListener("abort", onDone, { once: true });
      }
    });
  }

  send(method: string, params: unknown[]) {
    if (!this.ws || !this._isConnected) return;
    const msg = JSON.stringify({ m: method, p: params });
    this.ws.send(`~m~${msg.length}~m~${msg}`);
  }

  private _generateId(): string {
    return Math.random().toString(36).substring(2, 14);
  }

  private _parseMessage(text: string) {
    // Handle heartbeat packets first
    const heartbeatMatch = text.match(/~h~(\d+)/);
    if (heartbeatMatch) {
      this.ws?.send(`~h~${heartbeatMatch[1]}`);
    }

    const regex = /~m~(\d+)~m~/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const len = parseInt(match[1]);
      const jsonStr = text.substring(
        match.index + match[0].length,
        match.index + match[0].length + len,
      );
      try {
        const msg = JSON.parse(jsonStr);
        this._handlePacket(msg);
      } catch {}
      regex.lastIndex = match.index + match[0].length + len;
    }
  }

  private _handlePacket(msg: unknown) {
    if (typeof msg === "number") {
      this.ws?.send(`~m~${msg.toString().length}~m~${msg}`);
      return;
    }

    const packet = msg as TradingViewPacket;
    if (!packet || !packet.m) return;

    switch (packet.m) {
      case "qsd":
        this._handleQuoteData(packet.p);
        break;
      case "timescale_update":
      case "du":
        this._handleChartData(packet.p);
        break;
      case "series_completed":
        // Chart data ready
        break;
      case "study_loading":
        if (Array.isArray(packet.p) && typeof packet.p[1] === "string") {
          this.studies.handleStudyLoading(packet.p[1]);
        }
        break;
      case "study_completed":
        if (Array.isArray(packet.p) && typeof packet.p[1] === "string") {
          this.studies.handleStudyCompleted(packet.p[1]);
        }
        break;
      case "study_error":
        if (Array.isArray(packet.p) && typeof packet.p[1] === "string") {
          const errMsg =
            packet.p.length > 2 ? String(packet.p[2]) : "Unknown study error";
          this.studies.handleStudyError(packet.p[1], errMsg);
        }
        break;
    }
  }

  private _handleQuoteData(params: unknown[]) {
    if (!Array.isArray(params) || params.length < 2) return;
    const data = params[1] as { n: string; v: Record<string, unknown> };
    if (data && data.n && data.v) {
      const quote: Quote = { symbol: data.n, ...data.v };
      this._quoteCache.set(data.n, quote);
      this.emit("quote", quote);
    }
  }

  private _handleChartData(params: unknown[]) {
    if (!Array.isArray(params) || params.length < 2) return;
    const data = params[1] as Record<string, ChartUpdateData>;

    Object.keys(data).forEach((key) => {
      // Handle study data
      if (key.startsWith("st")) {
        this.studies.handleData(key, data[key] as StudyUpdateData);
        return;
      }

      // Handle price series data
      const seriesInfo = this._seriesIdMap.get(key);
      if (!seriesInfo) return;

      const seriesData = data[key];
      const rawCandles = seriesData?.s || [];

      const candles: StreamCandle[] = rawCandles
        .filter((c) => c.v && c.v.length >= 5)
        .map((c) => ({
          time: new Date(c.v[0] * 1000),
          open: c.v[1],
          high: c.v[2],
          low: c.v[3],
          close: c.v[4],
          volume: c.v.length >= 6 ? c.v[5] : 0,
        }));

      if (candles.length > 0) {
        const cacheKey = `${seriesInfo.symbol}:${seriesInfo.interval}`;
        const existing = this._candleCache.get(cacheKey) || [];

        // Merge candles (update existing or append new)
        candles.forEach((candle) => {
          const idx = existing.findIndex(
            (c) => c.time.getTime() === candle.time.getTime(),
          );
          if (idx >= 0) {
            existing[idx] = candle;
          } else {
            existing.push(candle);
          }
        });

        // Sort and keep last 1000
        existing.sort((a, b) => a.time.getTime() - b.time.getTime());
        if (existing.length > 1000) existing.splice(0, existing.length - 1000);

        this._candleCache.set(cacheKey, existing);

        // Emit latest candle
        const latest = existing[existing.length - 1];
        this.emit("candle", {
          symbol: seriesInfo.symbol,
          interval: seriesInfo.interval,
          candle: latest,
        });
      }
    });
  }

  private async _reconnect() {
    if (!this._shouldReconnect || this._reconnecting) return;
    this._reconnecting = true;

    const delays = [1000, 2000, 4000, 8000, 16000];
    for (let i = 0; i < delays.length; i++) {
      if (!this._shouldReconnect) break;

      await new Promise<void>((r) => {
        this._reconnectTimer = setTimeout(() => {
          this._reconnectTimer = null;
          r();
        }, delays[i]);
        this._reconnectTimer.unref?.();
      });
      if (!this._shouldReconnect) break;

      try {
        await this.connect();
        // Resubscribe to all symbols
        this._subscribedSymbols.forEach((s) => {
          this.send("quote_add_symbols", [this._quoteSession, s]);
        });
        // Resubscribe to charts
        this._chartSubscriptions.forEach((sub, _key) => {
          const tf = CHART_TIMEFRAMES[sub.interval] || "1D";
          this.send("resolve_symbol", [
            this._chartSession,
            sub.resolveId,
            `={"symbol":"${sub.symbol}","adjustment":"splits","session":"regular"}`,
          ]);
          this.send("create_series", [
            this._chartSession,
            sub.seriesId,
            "s1",
            sub.resolveId,
            tf,
            300,
            "",
          ]);
        });
        this._reconnecting = false;
        this.emit("reconnected");
        return;
      } catch {
        // Continue to next attempt
      }
    }
    this._reconnecting = false;
    this.emit("reconnect_failed");
  }
}

const CHART_TIMEFRAMES: Record<string, string> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "1h": "60",
  "2h": "120",
  "4h": "240",
  "1d": "1D",
  "1wk": "1W",
  "1w": "1W",
  "1mo": "1M",
};

/**
 * Factory helper to create a new TradingViewStream instance (aligned with borsapy's `create_stream`).
 */
export function createStream(authToken?: string): TradingViewStream {
  return new TradingViewStream(authToken);
}
