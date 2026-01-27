import { EventEmitter } from "events";
import { Ticker } from "@/ticker";
import { Interval, OHLCVData, Period } from "@/types";

export interface ReplayCandle extends OHLCVData {
  _index: number;
  _total: number;
  _progress: number;
}

export interface ReplayStats {
  symbol: string;
  totalCandles: number;
  currentIndex: number;
  progress: number;
  speed: number;
  realtimeInjection: boolean;
  elapsedTime: number;
  startDate: Date | null;
  endDate: Date | null;
  callbacksRegistered: number;
}

type CandleCallback = (candle: ReplayCandle) => void;

/**
 * Replay historical market data for backtesting
 *
 * Provides a generator-based interface for iterating over historical
 * OHLCV candles with speed control and callback support.
 *
 * @example
 * ```ts
 * const session = await createReplay("THYAO", { period: "6mo", speed: 10 });
 * for await (const candle of session.replay()) {
 *   console.log(candle.close);
 * }
 * ```
 */
export class ReplaySession extends EventEmitter {
  private data: OHLCVData[];
  private _symbol: string;
  private speed: number;
  private realtimeInjection: boolean;
  private currentIndex = 0;
  private startTime: number | null = null;
  private isReplaying = false;
  private _callbacks: CandleCallback[] = [];

  constructor(
    symbol: string,
    data: OHLCVData[],
    options: {
      speed?: number;
      realtimeInjection?: boolean;
    } = {},
  ) {
    super();
    this._symbol = symbol.toUpperCase();
    this.data = [...data].sort((a, b) => a.date.getTime() - b.date.getTime());
    this.speed = Math.max(0, options.speed ?? 1.0);
    this.realtimeInjection = options.realtimeInjection ?? false;
  }

  get symbol(): string {
    return this._symbol;
  }

  get totalCandles(): number {
    return this.data.length;
  }

  get progress(): number {
    if (this.totalCandles === 0) return 0;
    return this.currentIndex / this.totalCandles;
  }

  /**
   * Set new data for replay
   */
  setData(data: OHLCVData[]): void {
    this.data = [...data].sort((a, b) => a.date.getTime() - b.date.getTime());
    this.currentIndex = 0;
    this.startTime = null;
  }

  /**
   * Set playback speed
   */
  setSpeed(speed: number): void {
    this.speed = Math.max(0, speed);
  }

  /**
   * Register callback for candle updates
   */
  onCandle(callback: CandleCallback): void {
    this._callbacks.push(callback);
  }

  /**
   * Remove a registered callback
   */
  removeCallback(callback: CandleCallback): void {
    const idx = this._callbacks.indexOf(callback);
    if (idx >= 0) this._callbacks.splice(idx, 1);
  }

  /**
   * Reset replay to beginning
   */
  reset(): void {
    this.currentIndex = 0;
    this.startTime = null;
    this.isReplaying = false;
  }

  /**
   * Get replay statistics
   */
  stats(): ReplayStats {
    return {
      symbol: this._symbol,
      totalCandles: this.totalCandles,
      currentIndex: this.currentIndex,
      progress: this.progress,
      speed: this.speed,
      realtimeInjection: this.realtimeInjection,
      elapsedTime: this.startTime ? (Date.now() - this.startTime) / 1000 : 0,
      startDate: this.data.length > 0 ? this.data[0].date : null,
      endDate:
        this.data.length > 0 ? this.data[this.data.length - 1].date : null,
      callbacksRegistered: this._callbacks.length,
    };
  }

  private _buildCandle(idx: number): ReplayCandle {
    const item = this.data[idx];
    return {
      ...item,
      _index: idx,
      _total: this.data.length,
      _progress: (idx + 1) / this.data.length,
    };
  }

  private _calculateDelay(idx: number): number {
    if (!this.realtimeInjection || this.speed <= 0 || idx === 0) return 0;

    const current = this.data[idx];
    const prev = this.data[idx - 1];
    const diff = current.date.getTime() - prev.date.getTime();
    return diff / this.speed;
  }

  private _fireCallbacks(candle: ReplayCandle): void {
    for (const cb of this._callbacks) {
      try {
        cb(candle);
      } catch {
        // Silently ignore callback errors
      }
    }
    this.emit("candle", candle);
  }

  /**
   * Generator that yields candles one by one
   */
  async *replay(): AsyncGenerator<ReplayCandle> {
    if (this.data.length === 0) return;

    this.currentIndex = 0;
    this.startTime = Date.now();
    this.isReplaying = true;

    for (let i = 0; i < this.data.length; i++) {
      if (!this.isReplaying) break;
      this.currentIndex = i;

      // Apply delay
      if (i > 0) {
        const delay = this._calculateDelay(i);
        if (delay > 0) {
          await new Promise((r) => setTimeout(r, delay));
        }
      }

      const candle = this._buildCandle(i);
      this._fireCallbacks(candle);
      yield candle;
    }

    this.isReplaying = false;
    this.emit("complete");
  }

  /**
   * Generator that yields filtered candles by date range
   */
  async *replayFiltered(
    options: {
      startDate?: Date | string;
      endDate?: Date | string;
    } = {},
  ): AsyncGenerator<ReplayCandle> {
    if (this.data.length === 0) return;

    // Parse dates
    let startDate: Date | null = null;
    let endDate: Date | null = null;

    if (options.startDate) {
      startDate =
        typeof options.startDate === "string"
          ? new Date(options.startDate)
          : options.startDate;
    }
    if (options.endDate) {
      endDate =
        typeof options.endDate === "string"
          ? new Date(options.endDate)
          : options.endDate;
    }

    // Filter data
    const filteredIndices: number[] = [];
    for (let i = 0; i < this.data.length; i++) {
      const date = this.data[i].date;
      if (startDate && date < startDate) continue;
      if (endDate && date > endDate) continue;
      filteredIndices.push(i);
    }

    if (filteredIndices.length === 0) return;

    this.currentIndex = 0;
    this.startTime = Date.now();
    this.isReplaying = true;

    for (let i = 0; i < filteredIndices.length; i++) {
      if (!this.isReplaying) break;

      const originalIdx = filteredIndices[i];
      this.currentIndex = i;

      // Apply delay
      if (i > 0) {
        const delay = this._calculateDelay(originalIdx);
        if (delay > 0) {
          await new Promise((r) => setTimeout(r, delay));
        }
      }

      const candle = this._buildCandle(originalIdx);
      // Update filtered progress
      candle._index = i;
      candle._total = filteredIndices.length;
      candle._progress = (i + 1) / filteredIndices.length;

      this._fireCallbacks(candle);
      yield candle;
    }

    this.isReplaying = false;
    this.emit("complete");
  }

  /**
   * Stop the replay
   */
  stop(): void {
    this.isReplaying = false;
  }
}

/**
 * Create a ReplaySession with historical data loaded automatically
 */
export async function createReplay(
  symbol: string,
  options: {
    period?: Period;
    interval?: Interval;
    speed?: number;
    realtimeInjection?: boolean;
  } = {},
): Promise<ReplaySession> {
  const ticker = new Ticker(symbol);
  const data = await ticker.history({
    period: options.period || "1y",
    interval: options.interval || "1d",
  });

  if (!data || data.length === 0) {
    throw new Error(`No data for ${symbol}`);
  }

  return new ReplaySession(symbol, data, {
    speed: options.speed,
    realtimeInjection: options.realtimeInjection,
  });
}
