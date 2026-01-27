import { TechnicalAnalyzer } from "@/technical";
import { Ticker } from "@/ticker";
import { Interval, OHLCVData, Period } from "@/types";

export type Signal = "BUY" | "SELL" | "HOLD" | null;
export type Position = "long" | "short" | null;

export type StrategyFunc = (
  candle: Candle,
  position: Position,
  indicators: Record<string, number>,
) => Signal | Promise<Signal>;

export interface Candle {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  _index: number;
}

export interface Trade {
  entryTime: Date;
  entryPrice: number;
  exitTime?: Date;
  exitPrice?: number;
  side: "long" | "short";
  shares: number;
  commission: number;

  // Computed
  profit?: number;
  profitPct?: number;
  duration?: number; // days
}

export interface BacktestResult {
  symbol: string;
  period: string;
  interval: string;
  strategyName: string;
  initialCapital: number;
  commission: number;
  trades: Trade[];

  // Computed stats
  netProfit: number;
  netProfitPct: number;
  finalEquity: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number;
  avgTrade: number;
  maxDrawdown: number;
  maxDrawdownDuration: number; // days
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  buyHoldReturn: number;
  vsBuyHold: number;

  // Curves
  equityCurve: { date: Date; value: number }[];
  drawdownCurve: { date: Date; value: number }[];
  buyHoldCurve: { date: Date; value: number }[];
}

export class BacktestEngine {
  private symbol: string;
  private strategy: StrategyFunc;
  private period: Period;
  private interval: Interval;
  private capital: number;
  private commission: number;
  private indicators: string[];
  private warmupPeriod = 50;

  constructor(
    symbol: string,
    strategy: StrategyFunc,
    options: {
      period?: Period;
      interval?: Interval;
      capital?: number;
      commission?: number;
      indicators?: string[];
    } = {},
  ) {
    this.symbol = symbol;
    this.strategy = strategy;
    this.period = options.period || "1y";
    this.interval = options.interval || "1d";
    this.capital = options.capital || 100000;
    this.commission = options.commission || 0.001;
    this.indicators = options.indicators || ["rsi", "sma_20", "ema_12", "macd"];
  }

  async run(): Promise<BacktestResult> {
    const ticker = new Ticker(this.symbol);
    const df = await ticker.history({
      period: this.period,
      interval: this.interval,
    });

    if (!df || df.length === 0) {
      throw new Error(`No historical data for ${this.symbol}`);
    }

    // Sort valid data just in case
    const sorted = [...df].sort((a, b) => a.date.getTime() - b.date.getTime());

    // Calculate indicators
    const fullData = await this._calculateIndicators(sorted);

    let cash = this.capital;
    let position: Position = null;
    let shares = 0;
    const trades: Trade[] = [];
    let currentTrade: Trade | undefined;

    const equityValues: { date: Date; value: number }[] = [];
    const bhValues: { date: Date; value: number }[] = [];

    // Buy & hold tracking
    const initialPrice = sorted[this.warmupPeriod].close;
    const bhShares = this.capital / initialPrice;

    for (let i = this.warmupPeriod; i < fullData.length; i++) {
      const item = fullData[i];
      const candle: Candle = {
        timestamp: item.date,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: item.volume,
        _index: i,
      };

      // Extract indicators
      const inds: Record<string, number> = {};
      Object.keys(item).forEach((k) => {
        if (["date", "open", "high", "low", "close", "volume"].includes(k))
          return;
        const val = (item as unknown as Record<string, unknown>)[k];
        if (typeof val === "number") inds[k] = val;
      });

      const signal = await this.strategy(candle, position, inds);

      // Logic
      if (signal === "BUY" && position === null) {
        const price = candle.close;
        const entryComm = cash * this.commission;
        const avail = cash - entryComm;
        shares = avail / price;

        currentTrade = {
          entryTime: candle.timestamp,
          entryPrice: price,
          side: "long",
          shares,
          commission: entryComm,
        };

        cash = 0;
        position = "long";
      } else if (signal === "SELL" && position === "long" && currentTrade) {
        const price = candle.close;
        const exitVal = shares * price;
        const exitComm = exitVal * this.commission;

        currentTrade.exitTime = candle.timestamp;
        currentTrade.exitPrice = price;
        currentTrade.commission += exitComm;

        // Compute profit
        const gross =
          (currentTrade.exitPrice - currentTrade.entryPrice) *
          currentTrade.shares;
        currentTrade.profit = gross - currentTrade.commission;
        currentTrade.profitPct =
          (currentTrade.profit /
            (currentTrade.entryPrice * currentTrade.shares)) *
          100;

        const durMs =
          currentTrade.exitTime.getTime() - currentTrade.entryTime.getTime();
        currentTrade.duration = durMs / (1000 * 60 * 60 * 24);

        trades.push(currentTrade);

        cash = exitVal - exitComm;
        shares = 0;
        position = null;
        currentTrade = undefined;
      }

      // Equity
      let eq = cash;
      if (position === "long") {
        eq = shares * candle.close;
      }
      equityValues.push({ date: candle.timestamp, value: eq });
      bhValues.push({ date: candle.timestamp, value: bhShares * candle.close });
    }

    // Close at end
    if (position === "long" && currentTrade) {
      const last = fullData[fullData.length - 1];
      const price = last.close;
      const exitVal = shares * price;
      const exitComm = exitVal * this.commission;

      currentTrade.exitTime = last.date;
      currentTrade.exitPrice = price;
      currentTrade.commission += exitComm;

      const gross =
        (currentTrade.exitPrice - currentTrade.entryPrice) *
        currentTrade.shares;
      currentTrade.profit = gross - currentTrade.commission;
      currentTrade.profitPct =
        (currentTrade.profit /
          (currentTrade.entryPrice * currentTrade.shares)) *
        100;

      const durMs =
        currentTrade.exitTime.getTime() - currentTrade.entryTime.getTime();
      currentTrade.duration = durMs / (1000 * 60 * 60 * 24);

      trades.push(currentTrade);
      cash = exitVal - exitComm; // Update cash for final equity check
      equityValues[equityValues.length - 1].value = cash; // Update last equity point
    }

    // Stats
    const finalEquity =
      equityValues.length > 0
        ? equityValues[equityValues.length - 1].value
        : this.capital;
    const netProfit = finalEquity - this.capital;
    const netProfitPct = (netProfit / this.capital) * 100;

    const wins = trades.filter((t) => (t.profit || 0) > 0);
    const losses = trades.filter((t) => (t.profit || 0) <= 0);
    const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;

    const grossProfit = wins.reduce((s, t) => s + (t.profit || 0), 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.profit || 0), 0));
    const profitFactor =
      grossLoss === 0
        ? grossProfit > 0
          ? Infinity
          : 0
        : grossProfit / grossLoss;

    const avgTrade = trades.length > 0 ? netProfit / trades.length : 0;

    // Drawdown
    let maxDD = 0;
    let peak = -Infinity;
    const ddCurve: { date: Date; value: number }[] = [];

    for (const p of equityValues) {
      if (p.value > peak) peak = p.value;
      const dd = (peak - p.value) / peak; // fraction
      if (dd > maxDD) maxDD = dd;
      ddCurve.push({ date: p.date, value: dd * 100 });
    }

    // Sharpe (simplified, daily returns, ignore risk free for now or assume 0)
    // Daily returns
    const returns: number[] = [];
    for (let i = 1; i < equityValues.length; i++) {
      const prev = equityValues[i - 1].value;
      const curr = equityValues[i].value;
      if (prev !== 0) returns.push((curr - prev) / prev);
    }

    let sharpe = 0;
    if (returns.length > 0) {
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance =
        returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
      const std = Math.sqrt(variance);
      if (std !== 0) sharpe = (mean / std) * Math.sqrt(252);
    }

    // Sortino
    let sortino = 0;
    if (returns.length > 0) {
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const negativeReturns = returns.filter((r) => r < 0);
      if (negativeReturns.length > 0) {
        const negVariance =
          negativeReturns.reduce((a, b) => a + Math.pow(b - 0, 2), 0) /
          negativeReturns.length;
        const downsideStd = Math.sqrt(negVariance);
        if (downsideStd !== 0) sortino = (mean / downsideStd) * Math.sqrt(252);
      } else {
        sortino = mean > 0 ? Infinity : 0;
      }
    }

    // Max DD Duration
    let maxDDDuration = 0;
    let currentDDDuration = 0;
    let ddPeak = -Infinity;
    for (const p of equityValues) {
      if (p.value > ddPeak) {
        ddPeak = p.value;
        currentDDDuration = 0;
      } else if (p.value < ddPeak) {
        currentDDDuration++;
        if (currentDDDuration > maxDDDuration)
          maxDDDuration = currentDDDuration;
      }
    }

    // Calmar
    const calmar =
      maxDD > 0
        ? netProfitPct / (maxDD * 100)
        : netProfitPct > 0
          ? Infinity
          : 0;

    // Buy & Hold Return
    const bhFinal = bhValues[bhValues.length - 1].value;
    const bhReturn = ((bhFinal - this.capital) / this.capital) * 100;
    const vsBH = netProfitPct - bhReturn;

    // Get function name safely
    let sName = "strategy";
    try {
      if (this.strategy && this.strategy.name) {
        sName = this.strategy.name;
      }
    } catch {
      // ignore
    }

    return {
      symbol: this.symbol,
      period: this.period,
      interval: this.interval,
      strategyName: sName,
      initialCapital: this.capital,
      commission: this.commission,
      trades,
      netProfit,
      netProfitPct,
      finalEquity,
      totalTrades: trades.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate,
      profitFactor,
      avgTrade,
      maxDrawdown: maxDD * 100,
      maxDrawdownDuration: maxDDDuration,
      sharpeRatio: sharpe,
      sortinoRatio: sortino,
      calmarRatio: calmar,
      buyHoldReturn: bhReturn,
      vsBuyHold: vsBH,
      equityCurve: equityValues,
      drawdownCurve: ddCurve,
      buyHoldCurve: bhValues,
    };
  }

  private async _calculateIndicators(
    data: OHLCVData[],
  ): Promise<(OHLCVData & Record<string, number | Date>)[]> {
    const result: (OHLCVData & Record<string, number | Date>)[] = data.map(
      (d) => ({
        ...d,
      }),
    );
    const ta = new TechnicalAnalyzer(data);

    for (const ind of this.indicators) {
      const lower = ind.toLowerCase();

      // RSI variants
      if (lower === "rsi") {
        const vals = ta.rsi(14);
        this._merge(result, "rsi", vals);
      } else if (lower.startsWith("rsi_")) {
        const period = parseInt(lower.split("_")[1]);
        if (!isNaN(period)) {
          const vals = ta.rsi(period);
          this._merge(result, lower, vals);
        }
      }
      // SMA variants
      else if (lower.startsWith("sma_")) {
        const period = parseInt(lower.split("_")[1]);
        if (!isNaN(period)) {
          const vals = ta.sma(period);
          this._merge(result, lower, vals);
        }
      }
      // EMA variants
      else if (lower.startsWith("ema_")) {
        const period = parseInt(lower.split("_")[1]);
        if (!isNaN(period)) {
          const vals = ta.ema(period);
          this._merge(result, lower, vals);
        }
      }
      // MACD
      else if (lower === "macd") {
        const macd = ta.macd();
        this._merge(
          result,
          "macd",
          macd.map((m) => m.macd),
        );
        this._merge(
          result,
          "macd_signal",
          macd.map((m) => m.signal),
        );
        this._merge(
          result,
          "macd_histogram",
          macd.map((m) => m.histogram),
        );
      }
      // Bollinger Bands
      else if (lower === "bollinger" || lower === "bb") {
        const bb = ta.bollingerBands();
        this._merge(
          result,
          "bb_upper",
          bb.map((b) => b.upper),
        );
        this._merge(
          result,
          "bb_middle",
          bb.map((b) => b.middle),
        );
        this._merge(
          result,
          "bb_lower",
          bb.map((b) => b.lower),
        );
      }
      // ATR variants
      else if (lower === "atr") {
        const vals = ta.atr(14);
        this._merge(result, "atr", vals);
      } else if (lower.startsWith("atr_")) {
        const period = parseInt(lower.split("_")[1]);
        if (!isNaN(period)) {
          const vals = ta.atr(period);
          this._merge(result, lower, vals);
        }
      }
      // Stochastic
      else if (lower === "stochastic" || lower === "stoch") {
        const stoch = ta.stochastic();
        this._merge(
          result,
          "stoch_k",
          stoch.map((s) => s.k),
        );
        this._merge(
          result,
          "stoch_d",
          stoch.map((s) => s.d),
        );
      }
      // ADX
      else if (lower === "adx") {
        const vals = ta.adx(14);
        this._merge(result, "adx", vals);
      }
    }

    return result;
  }

  private _merge(
    data: Record<string, unknown>[],
    key: string,
    values: number[],
  ) {
    for (let i = 0; i < data.length; i++) {
      data[i][key] = values[i];
    }
  }
}
