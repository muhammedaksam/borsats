import { riskFreeRate } from "~/bond";
import {
  AllocationItem,
  FundDetail,
  FundHistoryItem,
  getTEFASProvider,
} from "~/providers/tefas";
import { TechnicalAnalyzer } from "~/technical";
import { FundType, OHLCVData } from "~/types";

export interface FundRiskMetrics {
  annualizedReturn: number;
  annualizedVolatility: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  riskFreeRate: number;
  tradingDays: number;
}

export class Fund {
  private _fundCode: string;
  private _infoCache: FundDetail | null = null;
  private _fundType: FundType | null = null;
  private _detectedFundType: FundType | null = null;

  constructor(fundCode: string, fundType: FundType | null = null) {
    this._fundCode = fundCode.toUpperCase();
    this._fundType = fundType; // Literal type doesn't need toUpperCase(), but it's safe
  }

  get fundCode(): string {
    return this._fundCode;
  }

  get symbol(): string {
    return this._fundCode;
  }

  get fundType(): Promise<FundType> {
    if (this._fundType) return Promise.resolve(this._fundType);
    if (this._detectedFundType) return Promise.resolve(this._detectedFundType);

    return this.detectFundType();
  }

  private async detectFundType(): Promise<FundType> {
    if (this._fundType || this._detectedFundType) {
      return this._fundType || this._detectedFundType!;
    }

    const endDt = new Date();
    const startDt = new Date(endDt.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Try YAT first
    try {
      const df = await getTEFASProvider().getHistory({
        fundCode: this._fundCode,
        start: startDt,
        end: endDt,
        fundType: "YAT",
      });
      if (df.length > 0) {
        this._detectedFundType = "YAT";
        return "YAT";
      }
    } catch {
      // ignore
    }

    // Try EMK
    try {
      const df = await getTEFASProvider().getHistory({
        fundCode: this._fundCode,
        start: startDt,
        end: endDt,
        fundType: "EMK",
      });
      if (df.length > 0) {
        this._detectedFundType = "EMK";
        return "EMK";
      }
    } catch {
      // ignore
    }

    // Default to YAT
    this._detectedFundType = "YAT";
    return "YAT";
  }

  get info(): Promise<FundDetail> {
    if (this._infoCache) return Promise.resolve(this._infoCache);
    return this.fundType.then((type) =>
      getTEFASProvider()
        .getFundDetail(this._fundCode, type)
        .then((data: FundDetail) => {
          this._infoCache = data;
          return data;
        }),
    );
  }

  get detail(): Promise<FundDetail> {
    return this.info;
  }

  get performance(): Promise<Partial<FundDetail>> {
    return this.info.then((info: FundDetail) => ({
      daily_return: info.daily_return,
      return_1m: info.return_1m,
      return_3m: info.return_3m,
      return_6m: info.return_6m,
      return_ytd: info.return_ytd,
      return_1y: info.return_1y,
      return_3y: info.return_3y,
      return_5y: info.return_5y,
    }));
  }

  get allocation(): Promise<AllocationItem[]> {
    return this.fundType.then((type) =>
      getTEFASProvider().getAllocation(
        this._fundCode,
        undefined,
        undefined,
        type,
      ),
    );
  }

  /**
   * Get historical allocation data
   */
  async allocationHistory(
    options: {
      period?: string;
      start?: Date | string;
      end?: Date | string;
    } = {},
  ): Promise<AllocationItem[]> {
    const { period = "1mo", start, end } = options;
    const type: FundType = await this.fundType;
    return getTEFASProvider().getAllocationHistory({
      fundCode: this._fundCode,
      period,
      start: start ? new Date(start) : undefined,
      end: end ? new Date(end) : undefined,
      fundType: type,
    });
  }

  async history(
    options: {
      period?: string;
      start?: Date | string;
      end?: Date | string;
    } = {},
  ): Promise<FundHistoryItem[]> {
    const { period = "1mo", start, end } = options;
    const type: FundType = await this.fundType;
    return getTEFASProvider().getHistory({
      fundCode: this._fundCode,
      period,
      start: start ? new Date(start) : undefined,
      end: end ? new Date(end) : undefined,
      fundType: type,
    });
  }

  async technicals(period: string = "1yr"): Promise<TechnicalAnalyzer> {
    const hist = await this.history({ period });
    // Map Fund history to OHLCV (open=close)
    const ohlcv: OHLCVData[] = hist.map((h: FundHistoryItem) => ({
      date: new Date(h.date),
      open: Number(h.price),
      high: Number(h.price),
      low: Number(h.price),
      close: Number(h.price),
      volume: 0,
    }));
    return new TechnicalAnalyzer(ohlcv);
  }

  async riskMetrics(
    period: string = "1y",
    rfRate?: number,
  ): Promise<FundRiskMetrics> {
    const hist = await this.history({ period });
    if (hist.length < 20) {
      return {
        annualizedReturn: NaN,
        annualizedVolatility: NaN,
        sharpeRatio: NaN,
        sortinoRatio: NaN,
        maxDrawdown: NaN,
        riskFreeRate: NaN,
        tradingDays: 0,
      };
    }

    const prices = hist.map((h: FundHistoryItem) => Number(h.price));
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }

    const tradingDays = returns.length;
    const annualizationFactor = 252;

    const totalReturn = prices[prices.length - 1] / prices[0] - 1;
    const years = tradingDays / annualizationFactor;
    const annualizedReturn = ((1 + totalReturn) ** (1 / years) - 1) * 100;

    // Standard deviation
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance =
      returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const annualizedVolatility = stdDev * Math.sqrt(annualizationFactor) * 100;

    // Risk free rate
    let rf = rfRate;
    if (rf === undefined) {
      const rfVal = (await riskFreeRate()) || 28.0;
      rf = rfVal;
    }

    // Sharpe
    let sharpe = NaN;
    if (annualizedVolatility > 0) {
      sharpe = (annualizedReturn - rf) / annualizedVolatility;
    }

    // Sortino
    const negativeReturns = returns.filter((r) => r < 0);
    let sortino = NaN;
    if (negativeReturns.length > 0) {
      const downMean =
        negativeReturns.reduce((a, b) => a + b, 0) / negativeReturns.length;
      const downVar =
        negativeReturns.reduce((a, b) => a + Math.pow(b - downMean, 2), 0) /
        negativeReturns.length;
      const downStd = Math.sqrt(downVar);

      const annualizedDownStd = downStd * Math.sqrt(annualizationFactor) * 100;
      if (annualizedDownStd > 0) {
        sortino = (annualizedReturn - rf) / annualizedDownStd;
      }
    } else {
      sortino = Infinity;
    }

    // Max Drawdown
    let maxDrawdown = 0;
    let peak = prices[0];
    for (const p of prices) {
      if (p > peak) peak = p;
      const dd = (p - peak) / peak;
      if (dd < maxDrawdown) maxDrawdown = dd;
    }
    maxDrawdown = maxDrawdown * 100;

    return {
      annualizedReturn,
      annualizedVolatility,
      sharpeRatio: sharpe,
      sortinoRatio: sortino,
      maxDrawdown,
      riskFreeRate: rf,
      tradingDays,
    };
  }

  async sharpeRatio(period: string = "1y", rfRate?: number): Promise<number> {
    const m = await this.riskMetrics(period, rfRate);
    return m.sharpeRatio;
  }
}

export function searchFunds(query: string) {
  return getTEFASProvider().search(query);
}

export function screenFunds(options: Record<string, unknown>) {
  return getTEFASProvider().screenFunds(options);
}

export async function compareFunds(fundCodes: string[]): Promise<{
  funds: FundDetail[];
  rankings: Record<string, string[]>;
  summary: Record<string, string | number>;
}> {
  // Fetch details for all funds
  const promises = fundCodes.map((code) =>
    new Fund(code).info.catch(() => null),
  );
  const results = await Promise.all(promises);

  // Filter out failed
  const funds = results.filter((f) => f !== null) as FundDetail[];

  if (funds.length === 0) {
    return {
      funds: [],
      rankings: {},
      summary: {},
    };
  }

  // Rankings
  const byReturn1y = [...funds]
    .sort((a, b) => (b.return_1y || 0) - (a.return_1y || 0))
    .map((f) => f.fund_code);
  const byReturnYtd = [...funds]
    .sort((a, b) => (b.return_ytd || 0) - (a.return_ytd || 0))
    .map((f) => f.fund_code);
  const bySize = [...funds]
    .sort((a, b) => (b.fund_size || 0) - (a.fund_size || 0))
    .map((f) => f.fund_code);

  // Summary
  const returns1y = funds
    .map((f) => f.return_1y)
    .filter((r) => r !== undefined) as number[];
  const avgReturn1y =
    returns1y.reduce((a, b) => a + b, 0) / (returns1y.length || 1);
  const maxReturn1y = Math.max(...returns1y);
  const minReturn1y = Math.min(...returns1y);

  return {
    funds,
    rankings: {
      by_return_1y: byReturn1y,
      by_return_ytd: byReturnYtd,
      by_size: bySize,
    },
    summary: {
      fund_count: funds.length,
      avg_return_1y: avgReturn1y,
      best_return_1y: maxReturn1y,
      worst_return_1y: minReturn1y,
    },
  };
}
