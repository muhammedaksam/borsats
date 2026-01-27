import { Crypto } from "~/crypto";
import { Fund } from "~/fund";
import { FX } from "~/fx";
import { Ticker } from "~/ticker";
import { Holding, Period } from "~/types";

/**
 * Portfolio class for managing multi-asset portfolios
 */
export class Portfolio {
  private holdings: Map<string, Holding> = new Map();
  private benchmark: string = "XU100";

  /**
   * Add a holding to the portfolio
   */
  add(
    symbol: string,
    options: {
      shares: number;
      cost?: number;
      assetType?: "stock" | "fx" | "crypto" | "fund";
    },
  ): Portfolio {
    const assetType = options.assetType || this.detectAssetType(symbol);

    this.holdings.set(symbol, {
      symbol,
      assetType,
      shares: options.shares,
      costPerShare: options.cost,
    });

    return this;
  }

  /**
   * Update a holding
   */
  update(
    symbol: string,
    options: {
      shares?: number;
      cost?: number;
    },
  ): Portfolio {
    const holding = this.holdings.get(symbol);
    if (!holding) {
      throw new Error(`Holding not found: ${symbol}`);
    }

    if (options.shares !== undefined) {
      holding.shares = options.shares;
    }
    if (options.cost !== undefined) {
      holding.costPerShare = options.cost;
    }

    return this;
  }

  /**
   * Remove a holding
   */
  remove(symbol: string): Portfolio {
    this.holdings.delete(symbol);
    return this;
  }

  /**
   * Set benchmark index
   */
  setBenchmark(symbol: string): Portfolio {
    this.benchmark = symbol;
    return this;
  }

  /**
   * Get total portfolio value
   */
  get value(): Promise<number> {
    return this.calculateTotalValue();
  }

  private async calculateTotalValue(): Promise<number> {
    const promises = Array.from(this.holdings.values()).map(async (h) => {
      let price = 0;
      try {
        if (h.assetType === "stock") {
          price = (await new Ticker(h.symbol).fastInfo.lastPrice) || 0;
        } else if (h.assetType === "fund") {
          const i = await new Fund(h.symbol).info;
          price = i.price;
        } else if (h.assetType === "fx") {
          const c = await new FX(h.symbol).current;
          price = c.last;
        } else if (h.assetType === "crypto") {
          const c = await new Crypto(h.symbol).current;
          price = c.last;
        }
      } catch (e) {
        console.warn(`Failed to get price for ${h.symbol}: ${e}`);
      }
      return h.shares * price;
    });

    const values = await Promise.all(promises);
    return values.reduce((a, b) => a + b, 0);
  }

  /**
   * Get total cost
   */
  get cost(): number {
    let total = 0;
    for (const holding of this.holdings.values()) {
      if (holding.costPerShare) {
        total += holding.shares * holding.costPerShare;
      }
    }
    return total;
  }

  /**
   * Get profit/loss
   */
  get pnl(): Promise<number> {
    return this.value.then((val) => val - this.cost);
  }

  /**
   * Get profit/loss percentage
   */
  get pnlPct(): Promise<number> {
    return this.pnl.then((pnl) =>
      this.cost > 0 ? (pnl / this.cost) * 100 : 0,
    );
  }

  /**
   * Get portfolio weights (by current value)
   */
  get weights(): Promise<Record<string, number>> {
    return this.calculateTotalValue().then(async (totalVal) => {
      const weights: Record<string, number> = {};
      if (totalVal === 0) return weights;

      for (const h of this.holdings.values()) {
        let price = 0;
        try {
          // Re-fetch logic duplicate, ideally cached or parallelized differently
          if (h.assetType === "stock")
            price = (await new Ticker(h.symbol).fastInfo.lastPrice) || 0;
          else if (h.assetType === "fund")
            price = (await new Fund(h.symbol).info).price;
          else if (h.assetType === "fx")
            price = (await new FX(h.symbol).current).last;
          else if (h.assetType === "crypto")
            price = (await new Crypto(h.symbol).current).last;
        } catch {
          // ignore
        }
        weights[h.symbol] = (h.shares * price) / totalVal;
      }
      return weights;
    });
  }

  /**
   * Export portfolio to dictionary
   */
  toDict(): {
    benchmark: string;
    holdings: Array<Holding & { symbol: string }>;
  } {
    return {
      benchmark: this.benchmark,
      holdings: Array.from(this.holdings.values()),
    };
  }

  /**
   * Create portfolio from dictionary
   */
  static fromDict(data: {
    benchmark?: string;
    holdings: Array<Holding & { symbol: string }>;
  }): Portfolio {
    const portfolio = new Portfolio();

    if (data.benchmark) {
      portfolio.setBenchmark(data.benchmark);
    }

    for (const holding of data.holdings) {
      portfolio.add(holding.symbol, {
        shares: holding.shares,
        cost: holding.costPerShare,
        assetType: holding.assetType,
      });
    }

    return portfolio;
  }

  /**
   * Clear all holdings
   */
  clear(): Portfolio {
    this.holdings.clear();
    return this;
  }

  private detectAssetType(symbol: string): "stock" | "fx" | "crypto" | "fund" {
    // Simple heuristic
    if (symbol.endsWith("TRY") && symbol.length > 3) {
      return "crypto"; // BTCTRY
    }
    if (symbol.length === 3 && /^[A-Z]{3}$/.test(symbol)) {
      // Checking if letters are uppercase
      // Could be Fund (3 chars like TTE) or FX (USD, EUR).
      // FX usually limited set. Funds are many.
      // Let's assume Fund if not in common FX list?
      const commonFX = ["USD", "EUR", "GBP", "JPY", "RUB", "CHF", "CAD", "AUD"];
      if (commonFX.includes(symbol)) return "fx";
      return "fund"; // Likely TEFAS fund
    }
    if (symbol.includes("-")) {
      return "fx"; // gram-altin
    }
    return "stock"; // THYAO
  }

  /**
   * Get list of symbols in portfolio
   */
  get symbols(): string[] {
    return Array.from(this.holdings.keys());
  }

  /**
   * Get detailed holdings with current prices and P&L
   */
  async holdingsDetail(): Promise<
    Array<{
      symbol: string;
      assetType: string;
      shares: number;
      cost: number;
      currentPrice: number;
      value: number;
      weight: number;
      pnl: number;
      pnlPct: number;
    }>
  > {
    const totalValue = await this.calculateTotalValue();
    const result: Array<{
      symbol: string;
      assetType: string;
      shares: number;
      cost: number;
      currentPrice: number;
      value: number;
      weight: number;
      pnl: number;
      pnlPct: number;
    }> = [];

    for (const h of this.holdings.values()) {
      let price = 0;
      try {
        if (h.assetType === "stock") {
          price = (await new Ticker(h.symbol).fastInfo.lastPrice) || 0;
        } else if (h.assetType === "fund") {
          const i = await new Fund(h.symbol).info;
          price = i.price;
        } else if (h.assetType === "fx") {
          const c = await new FX(h.symbol).current;
          price = c.last;
        } else if (h.assetType === "crypto") {
          const c = await new Crypto(h.symbol).current;
          price = c.last;
        }
      } catch {
        // ignore
      }

      const value = h.shares * price;
      const costBasis = h.costPerShare ? h.shares * h.costPerShare : 0;
      const pnl = costBasis > 0 ? value - costBasis : 0;
      const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;

      result.push({
        symbol: h.symbol,
        assetType: h.assetType,
        shares: h.shares,
        cost: h.costPerShare || 0,
        currentPrice: price,
        value,
        weight: totalValue > 0 ? (value / totalValue) * 100 : 0,
        pnl,
        pnlPct,
      });
    }

    return result;
  }

  /**
   * Get historical portfolio value
   */
  async history(
    period: string = "1y",
  ): Promise<Array<{ date: Date; value: number; dailyReturn: number }>> {
    if (this.holdings.size === 0) return [];

    const histories: Map<
      string,
      Array<{ date: Date; close: number }>
    > = new Map();

    // Fetch history for each holding
    for (const h of this.holdings.values()) {
      try {
        let hist: Array<{ date: Date; close: number }> = [];
        if (h.assetType === "stock") {
          const rawHist = await new Ticker(h.symbol).history({
            period: period as Period,
          });
          hist = rawHist.map((d) => ({ date: d.date, close: d.close }));
        } else if (h.assetType === "fund") {
          const rawHist = await new Fund(h.symbol).history({ period });
          hist = rawHist.map((d) => ({
            date: new Date(d.date),
            close: d.price,
          }));
        }
        if (hist.length > 0) {
          histories.set(h.symbol, hist);
        }
      } catch {
        // skip
      }
    }

    if (histories.size === 0) return [];

    // Find common dates
    const allDates = new Set<string>();
    for (const hist of histories.values()) {
      for (const h of hist) {
        allDates.add(h.date.toISOString().split("T")[0]);
      }
    }

    const sortedDates = Array.from(allDates).sort();
    const result: Array<{ date: Date; value: number; dailyReturn: number }> =
      [];
    let prevValue = 0;

    for (const dateStr of sortedDates) {
      let totalValue = 0;
      for (const [symbol, hist] of histories) {
        const holding = this.holdings.get(symbol);
        if (!holding) continue;

        const entry = hist.find(
          (h) => h.date.toISOString().split("T")[0] === dateStr,
        );
        if (entry) {
          totalValue += holding.shares * entry.close;
        }
      }

      const dailyReturn =
        prevValue > 0 ? ((totalValue - prevValue) / prevValue) * 100 : 0;
      result.push({
        date: new Date(dateStr),
        value: totalValue,
        dailyReturn,
      });
      prevValue = totalValue;
    }

    return result;
  }

  /**
   * Get portfolio performance summary
   */
  async performance(): Promise<{
    totalReturn: number;
    annualizedReturn: number;
    totalValue: number;
    totalCost: number;
    totalPnl: number;
  }> {
    const hist = await this.history("1y");
    const totalValue = await this.calculateTotalValue();
    const totalCost = this.cost;
    const totalPnl = totalValue - totalCost;

    let totalReturn = 0;
    let annualizedReturn = 0;

    if (hist.length >= 2) {
      const startVal = hist[0].value;
      const endVal = hist[hist.length - 1].value;
      if (startVal > 0) {
        totalReturn = ((endVal - startVal) / startVal) * 100;
        const days = hist.length;
        annualizedReturn = ((1 + totalReturn / 100) ** (365 / days) - 1) * 100;
      }
    }

    return {
      totalReturn,
      annualizedReturn,
      totalValue,
      totalCost,
      totalPnl,
    };
  }

  /**
   * Calculate comprehensive risk metrics
   */
  async riskMetrics(
    period: string = "1y",
    riskFreeRate?: number,
  ): Promise<{
    annualizedReturn: number;
    annualizedVolatility: number;
    sharpeRatio: number;
    sortinoRatio: number;
    maxDrawdown: number;
    riskFreeRate: number;
    tradingDays: number;
  }> {
    const hist = await this.history(period);
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

    const values = hist.map((h) => h.value);
    const returns: number[] = [];
    for (let i = 1; i < values.length; i++) {
      returns.push((values[i] - values[i - 1]) / values[i - 1]);
    }

    const tradingDays = returns.length;
    const annualizationFactor = 252;

    // Annualized return
    const totalReturn = values[values.length - 1] / values[0] - 1;
    const years = tradingDays / annualizationFactor;
    const annualizedReturn = ((1 + totalReturn) ** (1 / years) - 1) * 100;

    // Volatility
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance =
      returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const annualizedVolatility = stdDev * Math.sqrt(annualizationFactor) * 100;

    // Risk free rate
    const rf = riskFreeRate !== undefined ? riskFreeRate : 28.0;

    // Sharpe
    const sharpeRatio =
      annualizedVolatility > 0
        ? (annualizedReturn - rf) / annualizedVolatility
        : NaN;

    // Sortino
    const negativeReturns = returns.filter((r) => r < 0);
    let sortinoRatio = NaN;
    if (negativeReturns.length > 0) {
      const downMean =
        negativeReturns.reduce((a, b) => a + b, 0) / negativeReturns.length;
      const downVar =
        negativeReturns.reduce((a, b) => a + Math.pow(b - downMean, 2), 0) /
        negativeReturns.length;
      const downStd = Math.sqrt(downVar) * Math.sqrt(annualizationFactor) * 100;
      if (downStd > 0) {
        sortinoRatio = (annualizedReturn - rf) / downStd;
      }
    }

    // Max Drawdown
    let maxDrawdown = 0;
    let peak = values[0];
    for (const v of values) {
      if (v > peak) peak = v;
      const dd = (v - peak) / peak;
      if (dd < maxDrawdown) maxDrawdown = dd;
    }
    maxDrawdown = maxDrawdown * 100;

    return {
      annualizedReturn,
      annualizedVolatility,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown,
      riskFreeRate: rf,
      tradingDays,
    };
  }

  /**
   * Calculate Sharpe ratio
   */
  async sharpeRatio(period: string = "1y"): Promise<number> {
    const metrics = await this.riskMetrics(period);
    return metrics.sharpeRatio;
  }

  /**
   * Calculate Sortino ratio
   */
  async sortinoRatio(period: string = "1y"): Promise<number> {
    const metrics = await this.riskMetrics(period);
    return metrics.sortinoRatio;
  }

  /**
   * Calculate beta vs benchmark
   */
  async beta(benchmarkSymbol?: string, period: string = "1y"): Promise<number> {
    const bench = benchmarkSymbol || this.benchmark;
    const [portfolioHist, benchHist] = await Promise.all([
      this.history(period),
      new Ticker(bench).history({ period: period as Period }),
    ]);

    if (portfolioHist.length < 20 || benchHist.length < 20) return NaN;

    // Align dates
    const benchMap = new Map(
      benchHist.map((h) => [h.date.toISOString().split("T")[0], h.close]),
    );

    const portfolioReturns: number[] = [];
    const benchReturns: number[] = [];
    let prevPortfolio = 0;
    let prevBench = 0;

    for (let i = 0; i < portfolioHist.length; i++) {
      const dateKey = portfolioHist[i].date.toISOString().split("T")[0];
      const benchClose = benchMap.get(dateKey);
      if (!benchClose) continue;

      if (prevPortfolio > 0 && prevBench > 0) {
        portfolioReturns.push(
          (portfolioHist[i].value - prevPortfolio) / prevPortfolio,
        );
        benchReturns.push((benchClose - prevBench) / prevBench);
      }

      prevPortfolio = portfolioHist[i].value;
      prevBench = benchClose;
    }

    if (portfolioReturns.length < 10) return NaN;

    // Calculate beta: Cov(Rp, Rm) / Var(Rm)
    const meanP =
      portfolioReturns.reduce((a, b) => a + b, 0) / portfolioReturns.length;
    const meanB = benchReturns.reduce((a, b) => a + b, 0) / benchReturns.length;

    let covariance = 0;
    let variance = 0;
    for (let i = 0; i < portfolioReturns.length; i++) {
      covariance += (portfolioReturns[i] - meanP) * (benchReturns[i] - meanB);
      variance += Math.pow(benchReturns[i] - meanB, 2);
    }
    covariance /= portfolioReturns.length;
    variance /= portfolioReturns.length;

    return variance > 0 ? covariance / variance : NaN;
  }

  /**
   * Calculate correlation matrix between holdings
   */
  async correlationMatrix(
    period: string = "1y",
  ): Promise<Record<string, Record<string, number>>> {
    const symbols = this.symbols;
    if (symbols.length < 2) return {};

    const histories: Map<string, number[]> = new Map();

    // Fetch returns for each holding
    for (const symbol of symbols) {
      const h = this.holdings.get(symbol);
      if (!h) continue;

      try {
        let returns: number[] = [];
        if (h.assetType === "stock") {
          const hist = await new Ticker(symbol).history({
            period: period as Period,
          });
          for (let i = 1; i < hist.length; i++) {
            returns.push(
              (hist[i].close - hist[i - 1].close) / hist[i - 1].close,
            );
          }
        }
        if (returns.length > 10) {
          histories.set(symbol, returns);
        }
      } catch {
        // skip
      }
    }

    const result: Record<string, Record<string, number>> = {};

    for (const [sym1, returns1] of histories) {
      result[sym1] = {};
      for (const [sym2, returns2] of histories) {
        if (sym1 === sym2) {
          result[sym1][sym2] = 1.0;
          continue;
        }

        const len = Math.min(returns1.length, returns2.length);
        const r1 = returns1.slice(-len);
        const r2 = returns2.slice(-len);

        const mean1 = r1.reduce((a, b) => a + b, 0) / r1.length;
        const mean2 = r2.reduce((a, b) => a + b, 0) / r2.length;

        let covariance = 0;
        let var1 = 0;
        let var2 = 0;
        for (let i = 0; i < len; i++) {
          covariance += (r1[i] - mean1) * (r2[i] - mean2);
          var1 += Math.pow(r1[i] - mean1, 2);
          var2 += Math.pow(r2[i] - mean2, 2);
        }

        const denom = Math.sqrt(var1 * var2);
        result[sym1][sym2] = denom > 0 ? covariance / denom : 0;
      }
    }

    return result;
  }
}
