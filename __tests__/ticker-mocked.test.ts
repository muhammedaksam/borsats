/**
 * Mocked Ticker tests — exercises all new code paths in src/ticker.ts
 * without network calls, complementing the integration tests in ticker.test.ts.
 */

import { Ticker } from "~/ticker";
import * as tvProvider from "~/providers/tradingview";
import * as isyProvider from "~/providers/isyatirim";
import * as kapProvider from "~/providers/kap";
import * as hedefProvider from "~/providers/hedeffiyat";

// --- Synthetic OHLCV data for deterministic tests ---
function makeOHLCV(n: number) {
  const data = [];
  for (let i = 0; i < n; i++) {
    const base = 100 + Math.sin(i / 5) * 10 + i * 0.1;
    data.push({
      date: new Date(2024, 0, i + 1),
      open: base - 1,
      high: base + 2,
      low: base - 3,
      close: base,
      volume: 10000 + i * 100,
    });
  }
  return data;
}

const MOCK_OHLCV = makeOHLCV(260);

describe("Ticker (Mocked) — New Method Coverage", () => {
  jest.setTimeout(30000);

  // Mock providers to avoid network
  const mockTVProvider = {
    getCurrentQuote: jest.fn().mockResolvedValue({
      symbol: "TEST",
      last: 150,
      open: 148,
      high: 155,
      low: 147,
      close: 149,
      volume: 5000000,
      bid: 149.5,
      ask: 150.5,
      change: 1,
      changePercent: 0.67,
      updateTime: new Date(),
    }),
    getHistory: jest.fn().mockResolvedValue(MOCK_OHLCV),
  };

  const mockIsYProvider = {
    getCompanyMetrics: jest.fn().mockResolvedValue({
      marketCap: 30000000000,
      peRatio: 8.5,
      pbRatio: 1.2,
      evEbitda: 6.3,
      freeFloat: 35,
      foreignRatio: 40,
      netDebt: -5000000000,
    }),
    getFinancialStatements: jest.fn().mockResolvedValue([
      { Item: "Revenue", "2024": 100, "2023": 80 },
      { Item: "NetIncome", "2024": 30, "2023": 20 },
    ]),
    getDividends: jest.fn().mockResolvedValue([
      { date: new Date(2024, 5, 15), amount: 5.0 },
      { date: new Date(2023, 5, 15), amount: 4.0 },
    ]),
    getCapitalIncreases: jest.fn().mockResolvedValue([
      {
        date: new Date(2024, 3, 10),
        capital: 100,
        rightsIssue: 0,
        bonusFromCapital: 50,
        bonusFromDividend: 0,
      },
    ]),
    getMajorHolders: jest.fn().mockResolvedValue([
      { holder: "BigCorp", share: 51.2 },
    ]),
  };

  const mockKAPProvider = {
    getDisclosures: jest.fn().mockResolvedValue([
      { date: new Date(), title: "News", url: "https://kap.org" },
    ]),
    getCompanyDetails: jest.fn().mockResolvedValue({
      sector: "Airlines",
      market: "BIST Stars",
      website: "https://test.com",
      businessSummary: "Test company",
    }),
    getDisclosureContent: jest.fn().mockResolvedValue("<html>content</html>"),
    getCalendar: jest.fn().mockResolvedValue([
      {
        startDate: "01.01.2025",
        endDate: "15.03.2025",
        subject: "Finansal Rapor",
        period: "Q4",
        year: "2024",
      },
      {
        startDate: "01.01.2025",
        endDate: "bad.date",
        subject: "Finansal Rapor",
        period: "Q3",
        year: "2024",
      },
    ]),
  };

  const mockHedefProvider = {
    getPriceTargets: jest.fn().mockResolvedValue({
      current: 150,
      mean: 180,
      high: 200,
      low: 160,
      numberOfAnalysts: 5,
      median: 175,
    }),
    getRecommendationsSummary: jest.fn().mockResolvedValue({
      strongBuy: 2,
      buy: 5,
      hold: 3,
      sell: 1,
      strongSell: 0,
    }),
  };

  beforeEach(() => {
    jest
      .spyOn(tvProvider, "getTradingViewProvider")
      .mockReturnValue(mockTVProvider as unknown as ReturnType<typeof tvProvider.getTradingViewProvider>);
    jest
      .spyOn(isyProvider, "getIsYatirimProvider")
      .mockReturnValue(mockIsYProvider as unknown as ReturnType<typeof isyProvider.getIsYatirimProvider>);
    jest
      .spyOn(kapProvider, "getKAPProvider")
      .mockReturnValue(mockKAPProvider as unknown as ReturnType<typeof kapProvider.getKAPProvider>);
    jest
      .spyOn(hedefProvider, "getHedefFiyatProvider")
      .mockReturnValue(mockHedefProvider as unknown as ReturnType<typeof hedefProvider.getHedefFiyatProvider>);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("getBalanceSheet with all options", async () => {
    const ticker = new Ticker("TEST");
    const bs = await ticker.getBalanceSheet({
      quarterly: true,
      lastN: 4,
      financialGroup: "XI_29",
    });
    expect(bs).toBeDefined();
    expect(mockIsYProvider.getFinancialStatements).toHaveBeenCalledWith(
      "TEST",
      "balance_sheet",
      true,
      "XI_29",
      4,
    );
  });

  test("getBalanceSheet with defaults", async () => {
    const ticker = new Ticker("TEST");
    await ticker.getBalanceSheet();
    expect(mockIsYProvider.getFinancialStatements).toHaveBeenCalledWith(
      "TEST",
      "balance_sheet",
      false,
      undefined,
      undefined,
    );
  });

  test("getIncomeStmt with options", async () => {
    const ticker = new Ticker("TEST");
    await ticker.getIncomeStmt({ quarterly: true, lastN: 2 });
    expect(mockIsYProvider.getFinancialStatements).toHaveBeenCalledWith(
      "TEST",
      "income_stmt",
      true,
      undefined,
      2,
    );
  });

  test("getCashflow with options", async () => {
    const ticker = new Ticker("TEST");
    await ticker.getCashflow({ quarterly: false, lastN: "all" });
    expect(mockIsYProvider.getFinancialStatements).toHaveBeenCalledWith(
      "TEST",
      "cashflow",
      false,
      undefined,
      "all",
    );
  });

  test("TTM income statement (calculateTTM with 4+ quarters)", async () => {
    mockIsYProvider.getFinancialStatements.mockResolvedValueOnce({
      "2024Q4": { Revenue: 25, NetIncome: 8 },
      "2024Q3": { Revenue: 24, NetIncome: 7 },
      "2024Q2": { Revenue: 26, NetIncome: 9 },
      "2024Q1": { Revenue: 23, NetIncome: 6 },
    });

    const ticker = new Ticker("TEST");
    const ttm = await ticker.getTTMIncomeStmt();
    expect(ttm.Revenue).toBe(98); // 25+24+26+23
    expect(ttm.NetIncome).toBe(30); // 8+7+9+6
  });

  test("TTM cash flow", async () => {
    mockIsYProvider.getFinancialStatements.mockResolvedValueOnce({
      "2024Q4": { FCF: 10 },
      "2024Q3": { FCF: 12 },
      "2024Q2": { FCF: 8 },
      "2024Q1": { FCF: 15 },
    });

    const ticker = new Ticker("TEST");
    const ttm = await ticker.getTTMCashflow();
    expect(ttm.FCF).toBe(45);
  });

  test("TTM with fewer than 4 quarters returns empty", async () => {
    mockIsYProvider.getFinancialStatements.mockResolvedValueOnce({
      "2024Q4": { Revenue: 25 },
      "2024Q3": { Revenue: 24 },
    });

    const ticker = new Ticker("TEST");
    const ttm = await ticker.getTTMIncomeStmt();
    expect(Object.keys(ttm).length).toBe(0);
  });

  test("ttmIncomeStmt getter", async () => {
    mockIsYProvider.getFinancialStatements.mockResolvedValueOnce({
      "2024Q4": { A: 1 },
      "2024Q3": { A: 2 },
      "2024Q2": { A: 3 },
      "2024Q1": { A: 4 },
    });

    const ticker = new Ticker("TEST");
    const ttm = await ticker.ttmIncomeStmt;
    expect(ttm.A).toBe(10);
  });

  test("ttmCashflow getter", async () => {
    mockIsYProvider.getFinancialStatements.mockResolvedValueOnce({
      "2024Q4": { B: 5 },
      "2024Q3": { B: 5 },
      "2024Q2": { B: 5 },
      "2024Q1": { B: 5 },
    });

    const ticker = new Ticker("TEST");
    const ttm = await ticker.ttmCashflow;
    expect(ttm.B).toBe(20);
  });

  test("history with actions=true merges dividends and splits", async () => {
    const ticker = new Ticker("TEST");
    const hist = await ticker.history({ period: "1mo", actions: true });
    expect(hist.length).toBeGreaterThan(0);
    // Verify _mergeActions was called (dividends/splits fetched)
    expect(mockIsYProvider.getDividends).toHaveBeenCalled();
    expect(mockIsYProvider.getCapitalIncreases).toHaveBeenCalled();
  });

  test("history with adjust=false calls _unadjustPrices", async () => {
    const ticker = new Ticker("TEST");
    const hist = await ticker.history({ period: "1mo", adjust: false });
    expect(hist.length).toBeGreaterThan(0);
    // _unadjustPrices should have fetched splits
    expect(mockIsYProvider.getCapitalIncreases).toHaveBeenCalled();
  });

  test("history with start/end dates", async () => {
    const ticker = new Ticker("TEST");
    const hist = await ticker.history({
      start: "2024-01-01",
      end: "2024-06-01",
    });
    expect(hist.length).toBeGreaterThan(0);
  });

  test("info() builds enriched info", async () => {
    const ticker = new Ticker("TEST");
    const info = await ticker.info();
    expect(info.symbol).toBe("TEST");
    expect(info.marketCap).toBeDefined();
    expect(info.sector).toBe("Airlines");
    expect(info.website).toBe("https://test.com");
    // Dividend stats from mock dividends
    expect(info.fiftyTwoWeekHigh).toBeDefined();
    expect(info.fiftyTwoWeekLow).toBeDefined();
  });

  test("FastInfo todict", async () => {
    const ticker = new Ticker("TEST");
    const dict = await ticker.fastInfo.todict();
    expect(dict.currency).toBe("TRY");
    expect(dict.exchange).toBe("BIST");
    expect(dict.lastPrice).toBe(150);
  });

  test("FastInfo keys", () => {
    const ticker = new Ticker("TEST");
    const keys = ticker.fastInfo.keys();
    expect(keys).toContain("currency");
    expect(keys).toContain("lastPrice");
    expect(keys).toContain("fiftyDayAverage");
  });

  test("recommendationsSummary", async () => {
    const ticker = new Ticker("TEST");
    const recs = await ticker.recommendationsSummary;
    expect(recs.strongBuy).toBe(2);
    expect(recs.buy).toBe(5);
  });

  test("getNewsContent", async () => {
    const ticker = new Ticker("TEST");
    const content = await ticker.getNewsContent("12345");
    expect(content).toBe("<html>content</html>");
  });

  test("earningsDates filters financial reports and parses dates", async () => {
    const ticker = new Ticker("TEST");
    const dates = await ticker.earningsDates;
    // One valid date (15.03.2025), one bad date gets filtered
    expect(dates.length).toBe(1);
    expect(dates[0].date.getFullYear()).toBe(2025);
    expect(dates[0].epsEstimate).toBeNull();
  });

  test("priceTarget with valid data", async () => {
    const ticker = new Ticker("TEST");
    const pt = await ticker.priceTarget;
    expect(pt).not.toBeNull();
    expect(pt!.mean).toBe(180);
    expect(pt!.numberOfAnalysts).toBe(5);
    expect(pt!.median).toBe(175);
  });

  test("priceTarget returns null when data is null", async () => {
    mockHedefProvider.getPriceTargets.mockResolvedValueOnce({
      current: null,
      mean: null,
    });

    const ticker = new Ticker("TEST");
    const pt = await ticker.priceTarget;
    expect(pt).toBeNull();
  });

  test("priceTarget returns null on error", async () => {
    mockHedefProvider.getPriceTargets.mockRejectedValueOnce(
      new Error("fail"),
    );

    const ticker = new Ticker("TEST");
    const pt = await ticker.priceTarget;
    expect(pt).toBeNull();
  });

  test("MetaStock indicators (hhv, llv, mom, roc, wma, dema, tema)", async () => {
    const ticker = new Ticker("TEST");
    const results = await Promise.all([
      ticker.hhv(),
      ticker.llv(),
      ticker.mom(),
      ticker.roc(),
      ticker.wma(),
      ticker.dema(),
      ticker.tema(),
    ]);
    for (const r of results) {
      expect(typeof r).toBe("number");
    }
  });

  test("heikinAshi", async () => {
    const ticker = new Ticker("TEST");
    const ha = await ticker.heikinAshi();
    expect(ha.length).toBe(MOCK_OHLCV.length);
  });

  test("heikinAshi with empty history", async () => {
    mockTVProvider.getHistory.mockResolvedValueOnce([]);
    const ticker = new Ticker("TEST");
    const ha = await ticker.heikinAshi();
    expect(ha.length).toBe(0);
  });

  test("Indicator methods with empty history return NaN", async () => {
    mockTVProvider.getHistory.mockResolvedValue([]);
    const ticker = new Ticker("TEST");

    expect(await ticker.rsi()).toBeNaN();
    expect(await ticker.sma()).toBeNaN();
    expect(await ticker.ema()).toBeNaN();
    expect((await ticker.macd()).macd).toBeNaN();
    expect((await ticker.bollingerBands()).upper).toBeNaN();
    expect(await ticker.atr()).toBeNaN();
    expect((await ticker.stochastic()).k).toBeNaN();
    expect(await ticker.obv()).toBeNaN();
    expect(await ticker.vwap()).toBeNaN();
    expect(await ticker.adx()).toBeNaN();
    expect(await ticker.hhv()).toBeNaN();
    expect(await ticker.llv()).toBeNaN();
    expect(await ticker.mom()).toBeNaN();
    expect(await ticker.roc()).toBeNaN();
    expect(await ticker.wma()).toBeNaN();
    expect(await ticker.dema()).toBeNaN();
    expect(await ticker.tema()).toBeNaN();

    // Restore for other tests
    mockTVProvider.getHistory.mockResolvedValue(MOCK_OHLCV);
  });

  test("_unadjustPrices with no splits is a no-op", async () => {
    mockIsYProvider.getCapitalIncreases.mockResolvedValueOnce([]);
    const ticker = new Ticker("TEST");
    const hist = await ticker.history({ period: "1mo", adjust: false });
    expect(hist.length).toBeGreaterThan(0);
  });

  test("_unadjustPrices with splits having zero bonus is a no-op", async () => {
    mockIsYProvider.getCapitalIncreases.mockResolvedValueOnce([
      {
        date: new Date(2024, 1, 1),
        capital: 100,
        rightsIssue: 0,
        bonusFromCapital: 0,
        bonusFromDividend: 0,
      },
    ]);
    const ticker = new Ticker("TEST");
    const hist = await ticker.history({ period: "1mo", adjust: false });
    expect(hist.length).toBeGreaterThan(0);
  });

  test("calculateStartDate supports various periods", async () => {
    const ticker = new Ticker("TEST");

    // These all exercise calculateStartDate with different period values
    for (const period of [
      "1d", "5d", "1w", "1mo", "3mo", "6mo", "1y",
      "2y", "5y", "10y", "ytd", "max", "1g", "5g", "1ay", "3ay",
    ] as const) {
      const hist = await ticker.history({ period });
      expect(hist).toBeDefined();
    }
  });
});
