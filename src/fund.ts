import { riskFreeRate } from "~/bond";
import { FundHolding, getKAPHoldingsProvider } from "~/providers/kap-holdings";
import {
  AllocationItem,
  FundDetail,
  FundHistoryItem,
  getTEFASProvider,
  ScreenFundsOptions,
} from "~/providers/tefas";
import { classifyFundTaxCategory, getWithholdingTaxRate } from "~/tax";
import { TechnicalAnalyzer, TechnicalMixin } from "~/technical";
import {
  buildFundQuery,
  searchTweets,
  Tweet,
  TwitterSearchOptions,
} from "~/twitter";
import { FundType, OHLCVData, Period } from "~/types";

export interface FundRiskMetrics {
  annualizedReturn: number;
  annualizedVolatility: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  riskFreeRate: number;
  tradingDays: number;
}

export class Fund extends TechnicalMixin {
  private _fundCode: string;
  private _infoCache: FundDetail | null = null;
  private _fundType: FundType | null = null;
  private _detectedFundType: FundType | null = null;

  constructor(fundCode: string, fundType: FundType | null = null) {
    super();
    this._fundCode = fundCode.toUpperCase();
    this._fundType = fundType ? (fundType.toUpperCase() as FundType) : null;
  }

  protected async _getTechnicalHistory(
    period: Period = "1y",
  ): Promise<OHLCVData[]> {
    const hist = await this.history({ period });
    return hist.map((h: FundHistoryItem) => ({
      date: new Date(h.date),
      open: Number(h.price),
      high: Number(h.price),
      low: Number(h.price),
      close: Number(h.price),
      volume: 0,
    }));
  }

  /**
   * Get detailed portfolio holdings from KAP PDF disclosures via OpenRouter LLM.
   */
  async getHoldings(apiKey: string, period?: string): Promise<FundHolding[]> {
    return getKAPHoldingsProvider().getHoldings(this._fundCode, apiKey, period);
  }

  /**
   * Search Twitter/X for tweets related to this TEFAS fund.
   */
  async tweets(
    options: TwitterSearchOptions & { query?: string } = {},
  ): Promise<Tweet[]> {
    const { query, ...searchOpts } = options;
    let fundName: string | undefined;
    if (!query) {
      try {
        const info = await this.info;
        fundName = info.name;
      } catch {
        // Ignore info errors; search by code only
      }
    }
    const q = query || buildFundQuery(this._fundCode, fundName);
    return searchTweets(q, searchOpts);
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

    // Prefer fund_class from TEFAS v2 getFundDetail (aligned with borsapy v0.9.0+)
    try {
      const detail = await getTEFASProvider().getFundDetail(this._fundCode);
      if (detail) {
        this._infoCache = detail;
        if (detail.fund_class) {
          this._detectedFundType = detail.fund_class;
          return detail.fund_class;
        }
      }
    } catch {
      // Fall through to history probe
    }

    // Fallback probe (for custom/mocked providers without fund_class)
    const endDt = new Date();
    const startDt = new Date(endDt.getTime() - 7 * 24 * 60 * 60 * 1000);

    for (const candidate of ["YAT", "EMK"] as const) {
      try {
        const df = await getTEFASProvider().getHistory({
          fundCode: this._fundCode,
          start: startDt,
          end: endDt,
          fundType: candidate,
        });
        if (df.length > 0) {
          this._detectedFundType = candidate;
          return candidate;
        }
      } catch {
        // ignore
      }
    }

    this._detectedFundType = "YAT";
    return "YAT";
  }

  get info(): Promise<FundDetail> {
    if (this._infoCache) return Promise.resolve(this._infoCache);
    return getTEFASProvider()
      .getFundDetail(this._fundCode, this._fundType || "YAT")
      .then((data: FundDetail) => {
        this._infoCache = data;
        if (!this._fundType && !this._detectedFundType && data.fund_class) {
          this._detectedFundType = data.fund_class;
        }
        return data;
      });
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
   * Get historical portfolio allocation data (backed by `dagilimSiraliGetirT`).
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

  async technicals(period: string = "1y"): Promise<TechnicalAnalyzer> {
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

    // Sample standard deviation (ddof=1, matching pandas .std())
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const denom = returns.length > 1 ? returns.length - 1 : 1;
    const variance =
      returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / denom;
    const stdDev = Math.sqrt(variance);
    const annualizedVolatility = stdDev * Math.sqrt(annualizationFactor) * 100;

    // Risk free rate (percentage). Accepts decimal (e.g. 0.28) or percentage (e.g. 28).
    let rf: number;
    if (rfRate === undefined) {
      try {
        const rfVal = await riskFreeRate();
        if (rfVal !== null && rfVal !== undefined && !isNaN(rfVal)) {
          rf = rfVal <= 1 ? rfVal * 100 : rfVal;
        } else {
          rf = 30.0;
        }
      } catch {
        rf = 30.0;
      }
    } else {
      rf = rfRate > 0 && rfRate <= 1 ? rfRate * 100 : rfRate;
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
      const downDenom =
        negativeReturns.length > 1 ? negativeReturns.length - 1 : 1;
      const downVar =
        negativeReturns.reduce((a, b) => a + Math.pow(b - downMean, 2), 0) /
        downDenom;
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

  /**
   * Get management fee data for this fund
   */
  get managementFee(): Promise<{
    applied_fee: number | null;
    prospectus_fee: number | null;
    max_expense_ratio: number | null;
    annual_return: number | null;
  } | null> {
    return this.fundType.then((type) =>
      getTEFASProvider()
        .getManagementFees(type)
        .then((fees) => {
          const match = fees.find(
            (f) => f.fund_code.toUpperCase() === this._fundCode,
          );
          if (!match) return null;
          return {
            applied_fee: match.applied_fee,
            prospectus_fee: match.prospectus_fee,
            max_expense_ratio: match.max_expense_ratio,
            annual_return: match.annual_return,
          };
        })
        .catch(() => null),
    );
  }

  /**
   * Get tax category for this fund
   */
  get taxCategory(): Promise<string | null> {
    return this.info.then((info) => {
      return classifyFundTaxCategory(info.category || "", info.name);
    });
  }

  /**
   * Get withholding tax rate for this fund (as decimal, e.g. 0.175 for 17.5%)
   */
  async withholdingTaxRate(
    purchaseDate?: Date | string,
    holdingDays?: number,
  ): Promise<number | null> {
    const info = await this.info;
    const taxCat = classifyFundTaxCategory(info.category || "", info.name);
    if (taxCat === null) return null;
    return getWithholdingTaxRate(
      taxCat,
      purchaseDate ?? new Date(),
      holdingDays,
    );
  }
}

export function searchFunds(query: string, limit?: number) {
  return limit !== undefined
    ? getTEFASProvider().search(query, limit)
    : getTEFASProvider().search(query);
}

/**
 * Get management fees for all funds of a given type
 */
export function managementFees(
  fundType: "YAT" | "EMK" = "YAT",
  founder?: string,
) {
  return getTEFASProvider().getManagementFees(fundType, founder);
}

export function screenFunds(
  options: ScreenFundsOptions | Record<string, unknown> = {},
) {
  return getTEFASProvider().screenFunds(options as ScreenFundsOptions);
}

export async function compareFunds(fundCodes: string[]): Promise<{
  funds: FundDetail[];
  rankings: Record<string, string[]>;
  summary: Record<string, string | number | null>;
  errors?: Array<{ fund_code: string; error: string }>;
}> {
  if (!fundCodes || fundCodes.length === 0) {
    return {
      funds: [],
      rankings: {},
      summary: {},
    };
  }

  // Cap at 10 funds (matching borsapy)
  const limitedCodes = fundCodes.slice(0, 10).map((c) => c.toUpperCase());
  const errors: Array<{ fund_code: string; error: string }> = [];

  const promises = limitedCodes.map((code) =>
    new Fund(code).info.catch((err: unknown) => {
      errors.push({
        fund_code: code,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }),
  );
  const results = await Promise.all(promises);

  const funds = results.filter((f): f is FundDetail => f !== null);

  if (funds.length === 0) {
    const empty: {
      funds: FundDetail[];
      rankings: Record<string, string[]>;
      summary: Record<string, string | number | null>;
      errors?: Array<{ fund_code: string; error: string }>;
    } = {
      funds: [],
      rankings: {},
      summary: {},
    };
    if (errors.length > 0) {
      empty.errors = errors;
    }
    return empty;
  }

  // Rankings
  const byReturn1y = [...funds]
    .filter((f) => f.return_1y !== undefined && f.return_1y !== null)
    .sort((a, b) => (b.return_1y as number) - (a.return_1y as number))
    .map((f) => f.fund_code);
  const byReturnYtd = [...funds]
    .filter((f) => f.return_ytd !== undefined && f.return_ytd !== null)
    .sort((a, b) => (b.return_ytd as number) - (a.return_ytd as number))
    .map((f) => f.fund_code);
  const bySize = [...funds]
    .filter((f) => f.fund_size !== undefined && f.fund_size !== null)
    .sort((a, b) => (b.fund_size || 0) - (a.fund_size || 0))
    .map((f) => f.fund_code);
  const byRiskAsc = [...funds]
    .filter((f) => f.risk_value !== undefined && f.risk_value !== null)
    .sort((a, b) => (a.risk_value || 0) - (b.risk_value || 0))
    .map((f) => f.fund_code);

  // Summary
  const returns1y = funds
    .map((f) => f.return_1y)
    .filter((r): r is number => r !== undefined && r !== null);
  const returnsYtd = funds
    .map((f) => f.return_ytd)
    .filter((r): r is number => r !== undefined && r !== null);
  const sizes = funds
    .map((f) => f.fund_size)
    .filter((s): s is number => s !== undefined && s !== null);

  const avgReturn1y =
    returns1y.length > 0
      ? returns1y.reduce((a, b) => a + b, 0) / returns1y.length
      : null;
  const avgReturnYtd =
    returnsYtd.length > 0
      ? returnsYtd.reduce((a, b) => a + b, 0) / returnsYtd.length
      : null;
  const maxReturn1y = returns1y.length > 0 ? Math.max(...returns1y) : null;
  const minReturn1y = returns1y.length > 0 ? Math.min(...returns1y) : null;
  const totalSize = sizes.reduce((a, b) => a + b, 0);

  const out: {
    funds: FundDetail[];
    rankings: Record<string, string[]>;
    summary: Record<string, string | number | null>;
    errors?: Array<{ fund_code: string; error: string }>;
  } = {
    funds,
    rankings: {
      by_return_1y: byReturn1y,
      by_return_ytd: byReturnYtd,
      by_size: bySize,
      by_risk_asc: byRiskAsc,
    },
    summary: {
      fund_count: funds.length,
      total_size: totalSize,
      avg_return_1y: avgReturn1y,
      avg_return_ytd: avgReturnYtd,
      best_return_1y: maxReturn1y,
      worst_return_1y: minReturn1y,
    },
  };

  if (errors.length > 0) {
    out.errors = errors;
  }

  return out;
}
