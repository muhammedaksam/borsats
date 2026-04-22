import { getHedefFiyatProvider } from "~/providers/hedeffiyat";
import { getISINProvider } from "~/providers/isin";
import {
  CapitalIncreaseData,
  CompanyMetrics,
  getIsYatirimProvider,
} from "~/providers/isyatirim";
import { getKAPProvider } from "~/providers/kap";
import { getTradingViewProvider } from "~/providers/tradingview";
import {
  ETFHolder,
  getTradingViewETFProvider,
} from "~/providers/tradingview-etf";
import { getScannerProvider, TASignals } from "~/providers/tradingview-scanner";
import {
  calculateADX,
  calculateATR,
  calculateBollingerBands,
  calculateDEMA,
  calculateEMA,
  calculateHHV,
  calculateLLV,
  calculateMACD,
  calculateMOM,
  calculateOBV,
  calculateROC,
  calculateRSI,
  calculateSMA,
  calculateStochastic,
  calculateTEMA,
  calculateVWAP,
  calculateWMA,
  TechnicalAnalyzer,
} from "~/technical";
import {
  BalanceSheet,
  CashFlowStatement,
  CurrentData,
  DividendData,
  HolderData,
  IncomeStatement,
  Interval,
  NewsItem,
  OHLCVData,
  Period,
  PriceTarget,
} from "~/types";
import { cleanSymbol } from "~/utils/helpers";

/**
 * Compute backward dividend-adjusted close prices (yfinance "Adj Close").
 *
 * Assumes `closePrices` is already split-adjusted (TradingView default).
 * For each ex-dividend date `t` with close `C_t` and amount `D`, all prices
 * strictly before `t` are multiplied by `(C_t - D) / C_t`. This yields a
 * total-return price series: what you'd have if every dividend were
 * reinvested on its ex-date.
 *
 * @param closePrices - Split-adjusted close prices
 * @param closeDates - Corresponding dates for each close price
 * @param dividends - Dividend data with date and dividend fields
 * @returns Adjusted close values with the same length as closePrices
 */
export function computeAdjClose(
  closePrices: number[],
  closeDates: Date[],
  dividends: DividendData[],
): number[] {
  if (
    closePrices.length === 0 ||
    !dividends ||
    dividends.length === 0
  ) {
    return [...closePrices];
  }

  const factor = new Array<number>(closePrices.length).fill(1.0);

  // Sort dividends oldest → newest so compounding is correct
  const sortedDivs = [...dividends].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );

  for (const div of sortedDivs) {
    const amount = div.dividend;
    if (amount === undefined || amount === null || amount <= 0) {
      continue;
    }

    // Match by calendar date (YYYY-MM-DD string comparison)
    const divDateStr = div.date.toISOString().split("T")[0];
    let matchIdx = -1;
    for (let i = 0; i < closeDates.length; i++) {
      if (closeDates[i].toISOString().split("T")[0] === divDateStr) {
        matchIdx = i;
        break;
      }
    }

    if (matchIdx === -1) continue;

    const closeOnEx = closePrices[matchIdx];
    if (closeOnEx <= 0) continue;

    const adj = (closeOnEx - amount) / closeOnEx;
    for (let i = 0; i < matchIdx; i++) {
      factor[i] *= adj;
    }
  }

  return closePrices.map((price, i) => price * factor[i]);
}

/**
 * Extended OHLCV Data with Corporate Actions
 */
export type OHLCVWithActions = OHLCVData & {
  dividend?: number;
  split?: number;
  adjClose?: number;
};

/**
 * Enriched Information including Metrics and Details
 */
export interface EnrichedInfo extends CurrentData {
  // Extended Metrics from IsYatirim
  marketCap?: number;
  peRatio?: number;
  pbRatio?: number;
  evEbitda?: number;
  netDebt?: number;
  freeFloat?: number;
  foreignRatio?: number;
  sharesOutstanding?: number;

  // Company Details from KAP
  sector?: string;
  industry?: string;
  website?: string;
  description?: string; // businessSummary

  // Dividend Stats
  dividendYield?: number;
  exDividendDate?: Date;
  trailingAnnualDividendRate?: number;
  trailingAnnualDividendYield?: number;

  // Price Stats (Calculated)
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  fiftyDayAverage?: number;
  twoHundredDayAverage?: number;
}

/**
 * Fast access to common ticker information
 */
export class FastInfo {
  private _ticker: Ticker;
  private _data: Record<string, unknown> | null = null;

  constructor(ticker: Ticker) {
    this._ticker = ticker;
  }

  private async load(): Promise<void> {
    if (this._data) return;

    // Fetch in parallel
    const [quote, metrics, history] = await Promise.all([
      getTradingViewProvider().getCurrentQuote("BIST", this._ticker.symbol),
      getIsYatirimProvider()
        .getCompanyMetrics(this._ticker.symbol)
        .catch(() => ({}) as CompanyMetrics),
      this._ticker.history({ period: "1y" }).catch(() => [] as OHLCVData[]),
    ]);

    // Calculate averages
    let fiftyDayAvg: number | undefined;
    let twoHundredDayAvg: number | undefined;
    let yearHigh: number | undefined;
    let yearLow: number | undefined;

    if (history.length > 0) {
      const closes = history.map((h) => h.close);
      const highs = history.map((h) => h.high);
      const lows = history.map((h) => h.low);

      yearHigh = Math.max(...highs);
      yearLow = Math.min(...lows);

      if (closes.length >= 50) {
        const slice = closes.slice(closes.length - 50);
        fiftyDayAvg = slice.reduce((a, b) => a + b, 0) / 50;
      }

      if (closes.length >= 200) {
        const slice = closes.slice(closes.length - 200);
        twoHundredDayAvg = slice.reduce((a, b) => a + b, 0) / 200;
      }
    }

    // Calculate shares
    let shares: number | undefined;
    if (metrics.marketCap && quote.last) {
      shares = Math.floor(metrics.marketCap / quote.last);
    }

    this._data = {
      currency: "TRY",
      exchange: "BIST",
      timezone: "Europe/Istanbul",
      lastPrice: quote.last,
      open: quote.open,
      dayHigh: quote.high,
      dayLow: quote.low,
      previousClose: quote.close,
      volume: quote.volume,
      amount:
        quote.volume && quote.last ? quote.volume * quote.last : undefined,
      marketCap: metrics.marketCap,
      shares,
      peRatio: metrics.peRatio,
      pbRatio: metrics.pbRatio,
      yearHigh,
      yearLow,
      fiftyDayAverage: fiftyDayAvg,
      twoHundredDayAverage: twoHundredDayAvg,
      freeFloat: metrics.freeFloat,
      foreignRatio: metrics.foreignRatio,
    };
  }

  async get(key: string): Promise<unknown> {
    await this.load();
    return this._data?.[key];
  }

  // Getters for common fields (returning Promises)
  get currency(): Promise<string> {
    return this.get("currency") as Promise<string>;
  }
  get exchange(): Promise<string> {
    return this.get("exchange") as Promise<string>;
  }
  get lastPrice(): Promise<number> {
    return this.get("lastPrice") as Promise<number>;
  }
  get previousClose(): Promise<number> {
    return this.get("previousClose") as Promise<number>;
  }
  get open(): Promise<number> {
    return this.get("open") as Promise<number>;
  }
  get dayHigh(): Promise<number> {
    return this.get("dayHigh") as Promise<number>;
  }
  get dayLow(): Promise<number> {
    return this.get("dayLow") as Promise<number>;
  }
  get volume(): Promise<number> {
    return this.get("volume") as Promise<number>;
  }
  get marketCap(): Promise<number | undefined> {
    return this.get("marketCap") as Promise<number | undefined>;
  }
  get peRatio(): Promise<number | undefined> {
    return this.get("peRatio") as Promise<number | undefined>;
  }
  get pbRatio(): Promise<number | undefined> {
    return this.get("pbRatio") as Promise<number | undefined>;
  }
  get fiftyDayAverage(): Promise<number | undefined> {
    return this.get("fiftyDayAverage") as Promise<number | undefined>;
  }
  get twoHundredDayAverage(): Promise<number | undefined> {
    return this.get("twoHundredDayAverage") as Promise<number | undefined>;
  }
  get yearHigh(): Promise<number | undefined> {
    return this.get("yearHigh") as Promise<number | undefined>;
  }
  get yearLow(): Promise<number | undefined> {
    return this.get("yearLow") as Promise<number | undefined>;
  }

  /**
   * Return all available keys
   */
  keys(): string[] {
    return [
      "currency",
      "exchange",
      "timezone",
      "lastPrice",
      "open",
      "dayHigh",
      "dayLow",
      "previousClose",
      "volume",
      "amount",
      "marketCap",
      "shares",
      "peRatio",
      "pbRatio",
      "yearHigh",
      "yearLow",
      "fiftyDayAverage",
      "twoHundredDayAverage",
      "freeFloat",
      "foreignRatio",
    ];
  }

  /**
   * Return all data as a dictionary
   */
  async todict(): Promise<Record<string, unknown>> {
    await this.load();
    return { ...this._data };
  }
}

/**
 * Ticker class for BIST stock data
 * Provides comprehensive interface for Turkish stocks
 */
export class Ticker {
  public readonly symbol: string;
  private _fastInfo: FastInfo;

  constructor(symbol: string) {
    this.symbol = cleanSymbol(symbol);
    this._fastInfo = new FastInfo(this);
  }

  /**
   * Fast info - quick access to common metrics
   */
  get fastInfo(): FastInfo {
    return this._fastInfo;
  }

  /**
   * Detailed info - complete stock information
   */
  async info(): Promise<EnrichedInfo> {
    // Parallel fetch
    const [quote, metrics, details, dividends, history] = await Promise.all([
      getTradingViewProvider().getCurrentQuote("BIST", this.symbol),
      getIsYatirimProvider()
        .getCompanyMetrics(this.symbol)
        .catch(() => ({}) as CompanyMetrics),
      getKAPProvider()
        .getCompanyDetails(this.symbol)
        .catch(() => ({})),
      this.dividends.catch(() => [] as DividendData[]),
      this.history({ period: "1y" }).catch(() => [] as OHLCVData[]),
    ]);

    // Calculate dividend stats
    let dividendYield: number | undefined;
    let trailingAnnualDividendRate: number | undefined;
    let trailingAnnualDividendYield: number | undefined;
    let exDividendDate: Date | undefined;

    if (dividends.length > 0) {
      exDividendDate = dividends[0].date;
      // Last 1 year dividends
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const annualDivs = dividends.filter((d) => d.date >= oneYearAgo);
      if (annualDivs.length > 0) {
        trailingAnnualDividendRate = annualDivs.reduce(
          (a, b) => a + b.dividend,
          0,
        );
        if (quote.last) {
          trailingAnnualDividendYield = trailingAnnualDividendRate / quote.last;
          dividendYield = trailingAnnualDividendYield * 100;
        }
      }
    }

    // Calculate price stats
    let yearHigh: number | undefined;
    let yearLow: number | undefined;
    let fiftyDayAvg: number | undefined;
    let twoHundredDayAvg: number | undefined;

    if (history.length > 0) {
      const closes = history.map((h) => h.close);
      const highs = history.map((h) => h.high);
      const lows = history.map((h) => h.low);
      yearHigh = Math.max(...highs);
      yearLow = Math.min(...lows);

      if (closes.length >= 50) {
        fiftyDayAvg =
          closes.slice(closes.length - 50).reduce((a, b) => a + b, 0) / 50;
      }
      if (closes.length >= 200) {
        twoHundredDayAvg =
          closes.slice(closes.length - 200).reduce((a, b) => a + b, 0) / 200;
      }
    }

    // Shares
    let shares: number | undefined;
    if (metrics.marketCap && quote.last) {
      shares = Math.floor(metrics.marketCap / quote.last);
    }

    const info: EnrichedInfo = {
      ...quote,
      ...metrics,
      // Fix null vs undefined
      marketCap: metrics.marketCap || undefined,
      peRatio: metrics.peRatio || undefined,
      pbRatio: metrics.pbRatio || undefined,
      evEbitda: metrics.evEbitda || undefined,
      netDebt: metrics.netDebt || undefined,
      freeFloat: metrics.freeFloat || undefined,
      foreignRatio: metrics.foreignRatio || undefined,

      sharesOutstanding: shares,

      // KAP details
      sector: (details as { sector?: string }).sector,
      industry: (details as { market?: string }).market,
      website: (details as { website?: string }).website,
      description: (details as { businessSummary?: string }).businessSummary,

      dividendYield,
      exDividendDate,
      trailingAnnualDividendRate,
      trailingAnnualDividendYield,
      fiftyTwoWeekHigh: yearHigh,
      fiftyTwoWeekLow: yearLow,
      fiftyDayAverage: fiftyDayAvg,
      twoHundredDayAverage: twoHundredDayAvg,
    };

    return info;
  }

  /**
   * Get historical OHLCV data
   */
  async history(
    options: {
      period?: Period;
      interval?: Interval;
      start?: Date | string;
      end?: Date | string;
      actions?: boolean;
      adjust?: boolean;
      autoAdjust?: boolean;
    } = {},
  ): Promise<OHLCVWithActions[]> {
    const { period = "1mo", interval = "1d", adjust = true } = options;

    const endDate = options.end ? new Date(options.end) : new Date();
    const startDate = options.start
      ? new Date(options.start)
      : this.calculateStartDate(period, endDate);

    const provider = getTradingViewProvider();
    const history = (await provider.getHistory({
      exchange: "BIST",
      symbol: this.symbol,
      interval,
      start: startDate,
      end: endDate,
    })) as OHLCVWithActions[];

    if (options.actions && history.length > 0) {
      await this._mergeActions(history);
    }

    // Reverse split adjustments if unadjusted prices are requested
    if (!adjust && history.length > 0) {
      await this._unadjustPrices(history);
    }

    // Compute Adj Close (split + dividend adjusted, yfinance-style)
    if (options.autoAdjust && history.length > 0) {
      try {
        const divs = await this.dividends.catch(() => [] as DividendData[]);
        const closes = history.map((h) => h.close);
        const dates = history.map((h) => h.date);
        const adjCloses = computeAdjClose(closes, dates, divs);
        for (let i = 0; i < history.length; i++) {
          history[i].adjClose = adjCloses[i];
        }
      } catch {
        // Ignore — return data without adjClose
      }
    }

    return history;
  }

  /**
   * Reverse split adjustments on historical prices.
   * Walks backward through split events, multiplying prices
   * by the cumulative split factor so that pre-split bars
   * reflect their original nominal values.
   */
  private async _unadjustPrices(history: OHLCVWithActions[]): Promise<void> {
    try {
      const splitData = await this.splits.catch(
        () => [] as CapitalIncreaseData[],
      );
      if (splitData.length === 0) return;

      // Build split factor map
      const splitFactors: { date: Date; ratio: number }[] = [];
      for (const s of splitData) {
        const bonus = (s.bonusFromCapital || 0) + (s.bonusFromDividend || 0);
        if (bonus > 0) {
          splitFactors.push({
            date: s.date,
            ratio: 1 + bonus / 100,
          });
        }
      }

      if (splitFactors.length === 0) return;

      // Sort splits from most recent to oldest
      splitFactors.sort((a, b) => b.date.getTime() - a.date.getTime());

      // Walk backward: for each split, multiply all bars before the
      // split date by the split ratio
      for (const sf of splitFactors) {
        for (const bar of history) {
          if (bar.date < sf.date) {
            bar.open *= sf.ratio;
            bar.high *= sf.ratio;
            bar.low *= sf.ratio;
            bar.close *= sf.ratio;
            if (bar.volume > 0) {
              bar.volume = Math.round(bar.volume / sf.ratio);
            }
          }
        }
      }
    } catch {
      // Ignore errors — return data as-is
    }
  }

  private async _mergeActions(history: OHLCVWithActions[]): Promise<void> {
    try {
      const [dividends, splits] = await Promise.all([
        this.dividends.catch(() => [] as DividendData[]),
        this.splits.catch(() => [] as CapitalIncreaseData[]),
      ]);

      // Map to dates (YYYY-MM-DD string key)
      const divMap = new Map<string, number>();
      dividends.forEach((d) => {
        divMap.set(d.date.toDateString(), d.dividend);
      });

      const splitMap = new Map<string, number>();
      splits.forEach((s) => {
        // Calculate ratio: 1 + (bonusFromCapital + bonusFromDividend)/100
        const bonus = (s.bonusFromCapital || 0) + (s.bonusFromDividend || 0);
        if (bonus > 0) {
          const ratio = 1 + bonus / 100;
          splitMap.set(s.date.toDateString(), ratio);
        }
      });

      // Merge
      for (const candle of history) {
        const dateStr = candle.date.toDateString();
        if (divMap.has(dateStr)) {
          candle.dividend = divMap.get(dateStr);
        }
        if (splitMap.has(dateStr)) {
          candle.split = splitMap.get(dateStr);
        }
      }
    } catch {
      // Ignore errors in merging actions
    }
  }

  /**
   * Balance sheet (annual)
   */
  get balanceSheet(): Promise<BalanceSheet> {
    return getIsYatirimProvider().getFinancialStatements(
      this.symbol,
      "balance_sheet",
    ) as Promise<BalanceSheet>;
  }

  /**
   * Income statement (annual)
   */
  get incomeStmt(): Promise<IncomeStatement> {
    return getIsYatirimProvider().getFinancialStatements(
      this.symbol,
      "income_stmt",
    ) as Promise<IncomeStatement>;
  }

  /**
   * Cash flow statement (annual)
   */
  get cashflow(): Promise<CashFlowStatement> {
    return getIsYatirimProvider().getFinancialStatements(
      this.symbol,
      "cashflow",
    ) as Promise<CashFlowStatement>;
  }

  /**
   * Quarterly balance sheet
   */
  get quarterlyBalanceSheet(): Promise<BalanceSheet> {
    return getIsYatirimProvider().getFinancialStatements(
      this.symbol,
      "balance_sheet",
      true,
    ) as Promise<BalanceSheet>;
  }

  /**
   * Quarterly income statement
   */
  get quarterlyIncomeStmt(): Promise<IncomeStatement> {
    return getIsYatirimProvider().getFinancialStatements(
      this.symbol,
      "income_stmt",
      true,
    ) as Promise<IncomeStatement>;
  }

  /**
   * Quarterly cash flow
   */
  get quarterlyCashflow(): Promise<CashFlowStatement> {
    return getIsYatirimProvider().getFinancialStatements(
      this.symbol,
      "cashflow",
      true,
    ) as Promise<CashFlowStatement>;
  }

  /**
   * Get balance sheet with parametric lastN
   */
  async getBalanceSheet(
    options: {
      quarterly?: boolean;
      lastN?: number | string;
      financialGroup?: string;
    } = {},
  ): Promise<BalanceSheet> {
    return getIsYatirimProvider().getFinancialStatements(
      this.symbol,
      "balance_sheet",
      options.quarterly ?? false,
      options.financialGroup,
      options.lastN,
    ) as Promise<BalanceSheet>;
  }

  /**
   * Get income statement with parametric lastN
   */
  async getIncomeStmt(
    options: {
      quarterly?: boolean;
      lastN?: number | string;
      financialGroup?: string;
    } = {},
  ): Promise<IncomeStatement> {
    return getIsYatirimProvider().getFinancialStatements(
      this.symbol,
      "income_stmt",
      options.quarterly ?? false,
      options.financialGroup,
      options.lastN,
    ) as Promise<IncomeStatement>;
  }

  /**
   * Get cash flow with parametric lastN
   */
  async getCashflow(
    options: {
      quarterly?: boolean;
      lastN?: number | string;
      financialGroup?: string;
    } = {},
  ): Promise<CashFlowStatement> {
    return getIsYatirimProvider().getFinancialStatements(
      this.symbol,
      "cashflow",
      options.quarterly ?? false,
      options.financialGroup,
      options.lastN,
    ) as Promise<CashFlowStatement>;
  }

  /**
   * Dividend history
   */
  get dividends(): Promise<DividendData[]> {
    return getIsYatirimProvider()
      .getDividends(this.symbol)
      .then((divs) =>
        divs.map((d) => ({
          date: d.date,
          dividend: d.amount,
          type: "dividend",
        })),
      );
  }

  /**
   * Stock split history (Capital Increases)
   */
  get splits(): Promise<CapitalIncreaseData[]> {
    return getIsYatirimProvider().getCapitalIncreases(this.symbol);
  }

  /**
   * Major shareholders
   */
  get majorHolders(): Promise<HolderData[]> {
    return getIsYatirimProvider()
      .getMajorHolders(this.symbol)
      .then((data: unknown[]) =>
        data.map((h) => {
          const holder = h as {
            holder?: string;
            name?: string;
            share?: number;
            percentage?: number;
            amount?: number;
            shares?: number;
          };
          return {
            name: holder.holder || holder.name || "Unknown",
            percentage: holder.share || holder.percentage || 0,
            shares: holder.amount || holder.shares || 0,
          };
        }),
      );
  }

  /**
   * ETFs holding this stock
   */
  get etfHolders(): Promise<ETFHolder[]> {
    return getTradingViewETFProvider().getETFHolders(this.symbol);
  }

  /**
   * Company news and disclosures (KAP)
   */
  get news(): Promise<NewsItem[]> {
    return getKAPProvider()
      .getDisclosures(this.symbol)
      .then((disclosures) =>
        disclosures.map((d) => ({
          date: d.date,
          title: d.title,
          url: d.url,
          source: "KAP",
        })),
      );
  }

  /**
   * Analyst Price Targets
   */
  get priceTarget(): Promise<PriceTarget | null> {
    return getHedefFiyatProvider()
      .getPriceTargets(this.symbol)
      .then((pt) => {
        if (!pt || pt.current === null || pt.mean === null) return null;
        return {
          current: pt.current,
          mean: pt.mean,
          high: pt.high || pt.current, // Fallback
          low: pt.low || pt.current,
          numberOfAnalysts: pt.numberOfAnalysts || 0,
          median: pt.median || undefined,
        };
      })
      .catch(() => null);
  }

  /**
   * ISIN code
   */
  get isin(): Promise<string> {
    return getISINProvider()
      .getISIN(this.symbol)
      .then((isin) => isin || "");
  }

  /**
   * Technical Analysis
   */
  async technicals(
    period: Period = "1y",
    interval: Interval = "1d",
  ): Promise<TechnicalAnalyzer> {
    const hist = await this.history({ period, interval });
    return new TechnicalAnalyzer(hist);
  }

  /**
   * Get TradingView technical analysis signals
   */
  async taSignals(interval: Interval = "1d"): Promise<TASignals> {
    const provider = getScannerProvider();
    return provider.getTASignals(`BIST:${this.symbol}`, "turkey", interval);
  }

  /**
   * Get TA signals for all available timeframes
   */
  async taSignalsAllTimeframes(): Promise<
    Record<string, TASignals | { error: string }>
  > {
    const intervals: Interval[] = [
      "1m",
      "5m",
      "15m",
      "30m",
      "1h",
      "4h",
      "1d",
      "1w",
      "1mo",
    ];
    const result: Record<string, TASignals | { error: string }> = {};

    for (const interval of intervals) {
      try {
        result[interval] = await this.taSignals(interval);
      } catch (e) {
        result[interval] = {
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }

    return result;
  }

  async rsi(period: Period = "3mo", rsiPeriod = 14): Promise<number> {
    const hist = await this.history({ period });
    if (hist.length === 0) return NaN;
    const series = calculateRSI(hist, rsiPeriod);
    return series[series.length - 1];
  }

  async sma(period: Period = "3mo", smaPeriod = 20): Promise<number> {
    const hist = await this.history({ period });
    if (hist.length === 0) return NaN;
    const series = calculateSMA(hist, smaPeriod);
    return series[series.length - 1];
  }

  async ema(period: Period = "3mo", emaPeriod = 20): Promise<number> {
    const hist = await this.history({ period });
    if (hist.length === 0) return NaN;
    const series = calculateEMA(hist, emaPeriod);
    return series[series.length - 1];
  }

  async macd(
    period: Period = "3mo",
    fast = 12,
    slow = 26,
    signal = 9,
  ): Promise<{ macd: number; signal: number; histogram: number }> {
    const hist = await this.history({ period });
    if (hist.length === 0) return { macd: NaN, signal: NaN, histogram: NaN };
    const series = calculateMACD(hist, fast, slow, signal);
    return series[series.length - 1];
  }

  async bollingerBands(
    period: Period = "3mo",
    bbPeriod = 20,
    stdDev = 2.0,
  ): Promise<{ upper: number; middle: number; lower: number }> {
    const hist = await this.history({ period });
    if (hist.length === 0) return { upper: NaN, middle: NaN, lower: NaN };
    const series = calculateBollingerBands(hist, bbPeriod, stdDev);
    return series[series.length - 1];
  }

  async atr(period: Period = "3mo", atrPeriod = 14): Promise<number> {
    const hist = await this.history({ period });
    if (hist.length === 0) return NaN;
    const series = calculateATR(hist, atrPeriod);
    return series[series.length - 1];
  }

  async stochastic(
    period: Period = "3mo",
    kPeriod = 14,
    dPeriod = 3,
  ): Promise<{ k: number; d: number }> {
    const hist = await this.history({ period });
    if (hist.length === 0) return { k: NaN, d: NaN };
    const series = calculateStochastic(hist, kPeriod, dPeriod);
    return series[series.length - 1];
  }

  async obv(period: Period = "3mo"): Promise<number> {
    const hist = await this.history({ period });
    if (hist.length === 0) return NaN;
    const series = calculateOBV(hist);
    return series[series.length - 1];
  }

  async vwap(period: Period = "3mo"): Promise<number> {
    const hist = await this.history({ period });
    if (hist.length === 0) return NaN;
    const series = calculateVWAP(hist);
    return series[series.length - 1];
  }

  async adx(period: Period = "3mo", adxPeriod = 14): Promise<number> {
    const hist = await this.history({ period });
    if (hist.length === 0) return NaN;
    const series = calculateADX(hist, adxPeriod);
    return series[series.length - 1];
  }

  async hhv(period: Period = "3mo", hhvPeriod = 14): Promise<number> {
    const hist = await this.history({ period });
    if (hist.length === 0) return NaN;
    const series = calculateHHV(hist, hhvPeriod);
    return series[series.length - 1];
  }

  async llv(period: Period = "3mo", llvPeriod = 14): Promise<number> {
    const hist = await this.history({ period });
    if (hist.length === 0) return NaN;
    const series = calculateLLV(hist, llvPeriod);
    return series[series.length - 1];
  }

  async mom(period: Period = "3mo", momPeriod = 10): Promise<number> {
    const hist = await this.history({ period });
    if (hist.length === 0) return NaN;
    const series = calculateMOM(hist, momPeriod);
    return series[series.length - 1];
  }

  async roc(period: Period = "3mo", rocPeriod = 10): Promise<number> {
    const hist = await this.history({ period });
    if (hist.length === 0) return NaN;
    const series = calculateROC(hist, rocPeriod);
    return series[series.length - 1];
  }

  async wma(period: Period = "3mo", wmaPeriod = 20): Promise<number> {
    const hist = await this.history({ period });
    if (hist.length === 0) return NaN;
    const series = calculateWMA(hist, wmaPeriod);
    return series[series.length - 1];
  }

  async dema(period: Period = "3mo", demaPeriod = 20): Promise<number> {
    const hist = await this.history({ period });
    if (hist.length === 0) return NaN;
    const series = calculateDEMA(hist, demaPeriod);
    return series[series.length - 1];
  }

  async tema(period: Period = "3mo", temaPeriod = 20): Promise<number> {
    const hist = await this.history({ period });
    if (hist.length === 0) return NaN;
    const series = calculateTEMA(hist, temaPeriod);
    return series[series.length - 1];
  }

  /**
   * Get Heikin Ashi candlestick data
   */
  async heikinAshi(
    period: Period = "1mo",
    interval: Interval = "1d",
  ): Promise<OHLCVData[]> {
    const { calculateHeikinAshi } = await import("~/charts");
    const hist = await this.history({ period, interval });
    if (hist.length === 0) return [];
    return calculateHeikinAshi(hist);
  }

  private calculateStartDate(period: Period, endDate: Date): Date {
    const periodDays: Record<string, number> = {
      "1d": 1,
      "5d": 5,
      "1w": 7,
      "1mo": 30,
      "3mo": 90,
      "6mo": 180,
      "1y": 365,
      "2y": 730,
      "5y": 1825,
      "10y": 3650,
      ytd: this.daysYTD(endDate),
      max: 36500, // 100 years
      "1g": 1,
      "5g": 5,
      "1ay": 30,
      "3ay": 90,
    };

    const days = periodDays[period] || 30;
    const start = new Date(endDate);
    start.setDate(start.getDate() - days);
    return start;
  }

  private daysYTD(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 1);
    const diff = date.getTime() - start.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  /**
   * Combined dividends and splits history
   */
  get actions(): Promise<
    Array<{ date: Date; dividends: number; splits: number }>
  > {
    return Promise.all([this.dividends, this.splits]).then(([divs, splits]) => {
      const actions = new Map<
        string,
        { date: Date; dividends: number; splits: number }
      >();

      // Add dividends
      for (const d of divs) {
        const key = d.date.toISOString().split("T")[0];
        if (!actions.has(key)) {
          actions.set(key, { date: d.date, dividends: 0, splits: 0 });
        }
        actions.get(key)!.dividends = d.dividend || 0;
      }

      // Add splits
      for (const s of splits) {
        const key = s.date.toISOString().split("T")[0];
        if (!actions.has(key)) {
          actions.set(key, { date: s.date, dividends: 0, splits: 0 });
        }
        const bonusFromCapital = s.bonusFromCapital || 0;
        const bonusFromDividend = s.bonusFromDividend || 0;
        actions.get(key)!.splits = bonusFromCapital + bonusFromDividend;
      }

      return Array.from(actions.values()).sort(
        (a, b) => b.date.getTime() - a.date.getTime(),
      );
    });
  }

  /**
   * Calculate trailing twelve months by summing last 4 quarters
   */
  private calculateTTM(
    quarterly: Record<string, Record<string, number>>,
  ): Record<string, number> {
    const periods = Object.keys(quarterly).slice(0, 4);
    if (periods.length < 4) return {};

    const result: Record<string, number> = {};
    const firstPeriod = quarterly[periods[0]];

    for (const key of Object.keys(firstPeriod)) {
      let sum = 0;
      for (const p of periods) {
        const val = quarterly[p]?.[key];
        if (typeof val === "number" && !isNaN(val)) {
          sum += val;
        }
      }
      result[key] = sum;
    }

    return result;
  }

  /**
   * Get trailing twelve months (TTM) income statement
   */
  async getTTMIncomeStmt(
    financialGroup?: string,
  ): Promise<Record<string, number>> {
    const quarterly = (await getIsYatirimProvider().getFinancialStatements(
      this.symbol,
      "income_stmt",
      true,
      financialGroup,
    )) as unknown as Record<string, Record<string, number>>;
    return this.calculateTTM(quarterly);
  }

  /**
   * Get trailing twelve months (TTM) cash flow
   */
  async getTTMCashflow(
    financialGroup?: string,
  ): Promise<Record<string, number>> {
    const quarterly = (await getIsYatirimProvider().getFinancialStatements(
      this.symbol,
      "cashflow",
      true,
      financialGroup,
    )) as unknown as Record<string, Record<string, number>>;
    return this.calculateTTM(quarterly);
  }

  /**
   * TTM income statement property
   */
  get ttmIncomeStmt(): Promise<Record<string, number>> {
    return this.getTTMIncomeStmt();
  }

  /**
   * TTM cash flow property
   */
  get ttmCashflow(): Promise<Record<string, number>> {
    return this.getTTMCashflow();
  }

  /**
   * Analyst recommendation summary with buy/hold/sell counts
   */
  get recommendationsSummary(): Promise<{
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
  }> {
    return getHedefFiyatProvider()
      .getRecommendationsSummary(this.symbol)
      .catch(() => ({ strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0 }));
  }

  /**
   * Get full HTML content of a KAP disclosure
   */
  async getNewsContent(disclosureId: string | number): Promise<string | null> {
    return getKAPProvider().getDisclosureContent(String(disclosureId));
  }

  /**
   * Expected disclosure calendar (KAP)
   */
  get calendar(): Promise<
    Array<{
      startDate: string;
      endDate: string;
      subject: string;
      period: string;
      year: string;
    }>
  > {
    return getKAPProvider().getCalendar(this.symbol) as Promise<
      Array<{
        startDate: string;
        endDate: string;
        subject: string;
        period: string;
        year: string;
      }>
    >;
  }

  /**
   * Upcoming earnings announcement dates
   */
  get earningsDates(): Promise<
    Array<{
      date: Date;
      epsEstimate: null;
      reportedEps: null;
      surprise: null;
    }>
  > {
    return this.calendar.then((cal) => {
      const financialReports = cal.filter(
        (item) =>
          item.subject && item.subject.toLowerCase().includes("finansal rapor"),
      );

      return financialReports
        .map((item) => {
          const parts = item.endDate.split(".");
          if (parts.length !== 3) return null;
          const date = new Date(
            parseInt(parts[2]),
            parseInt(parts[1]) - 1,
            parseInt(parts[0]),
          );
          if (isNaN(date.getTime())) return null;

          return {
            date,
            epsEstimate: null,
            reportedEps: null,
            surprise: null,
          };
        })
        .filter((d) => d !== null)
        .sort((a, b) => a!.date.getTime() - b!.date.getTime()) as Array<{
        date: Date;
        epsEstimate: null;
        reportedEps: null;
        surprise: null;
      }>;
    });
  }
}
