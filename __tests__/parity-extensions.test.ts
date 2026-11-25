import { Index } from "~/bist-index";
import { calculateHeikinAshi, calculateHeikinAshiVectorized } from "~/charts";
import { Crypto } from "~/crypto";
import { AuthenticationError } from "~/exceptions";
import { Fund } from "~/fund";
import { FX } from "~/fx";
import { Portfolio } from "~/portfolio";
import { getDovizcomProvider } from "~/providers/dovizcom";
import { getIsYatirimProvider } from "~/providers/isyatirim";
import { getScreenerProvider } from "~/providers/isyatirim-screener";
import {
  clearIndicatorCache,
  getPineFacadeProvider,
} from "~/providers/pine-facade";
import { getTEFASProvider } from "~/providers/tefas";
import {
  clearTradingViewAuth,
  getTradingViewAuth,
  getTradingViewProvider,
  setTradingViewAuth,
} from "~/providers/tradingview";
import {
  getSearchProvider,
  monthCodeToName,
} from "~/providers/tradingview-search";
import { screenStocks } from "~/screener";
import { createStream, TradingViewStream } from "~/stream";
import {
  calculateBollingerBands,
  calculateEMA,
  calculateMACD,
  calculateMOM,
  calculateROC,
  calculateRSI,
  calculateSMA,
  calculateTEMA,
  calculateTilsonT3,
  calculateWMA,
  TechnicalAnalyzer,
  TechnicalMixin,
} from "~/technical";
import { Ticker } from "~/ticker";
import { OHLCVData } from "~/types";
import { TTL } from "~/utils/helpers";

function makeCandles(n: number): OHLCVData[] {
  const rows: OHLCVData[] = [];
  for (let i = 0; i < n; i++) {
    const base = 100 + i * 0.5 + Math.sin(i / 3) * 2;
    rows.push({
      date: new Date(Date.UTC(2024, 0, i + 1)),
      open: base - 0.5,
      high: base + 1.5,
      low: base - 1.5,
      close: base,
      volume: 1000 + i * 10,
    });
  }
  return rows;
}

describe("borsapy v0.11.0 Parity Extensions", () => {
  afterEach(() => {
    clearTradingViewAuth();
    jest.restoreAllMocks();
  });

  test("TradingViewProvider.getUser validates session cookies and sets authToken", async () => {
    const tv = getTradingViewProvider();
    const client = (tv as unknown as { client: { get: jest.Mock } }).client;

    jest.spyOn(client, "get").mockResolvedValueOnce({
      data: '<html><script>{"id":77,"username":"xanela","auth_token":"jwt_secret_123"}</script></html>',
    });

    const creds = await setTradingViewAuth({
      session: "sess123",
      sessionSign: "sign456",
    });
    expect(creds?.authToken).toBe("jwt_secret_123");
    expect(getTradingViewAuth()?.user?.username).toBe("xanela");

    jest.spyOn(client, "get").mockResolvedValueOnce({
      data: "<html>logged out page</html>",
    });
    await expect(
      setTradingViewAuth({ session: "expired" }),
    ).rejects.toThrow(AuthenticationError);
  });

  test("TradingViewProvider.getQuote delegates to getCurrentQuote", async () => {
    const tv = getTradingViewProvider();
    const spy = jest.spyOn(tv, "getCurrentQuote").mockResolvedValueOnce({
      symbol: "THYAO",
      last: 300,
    });
    const q = await tv.getQuote("THYAO");
    expect(q.last).toBe(300);
    expect(spy).toHaveBeenCalledWith("BIST", "THYAO");
  });

  test("IsYatirimProvider.getRecommendations & Ticker.recommendations / analystPriceTargets / FastInfo getters", async () => {
    const isy = getIsYatirimProvider();
    isy.clearCache();
    jest
      .spyOn(
        isy as unknown as { _fetchSermayeData: (s: string) => Promise<unknown> },
        "_fetchSermayeData",
      )
      .mockResolvedValueOnce({
        d: JSON.stringify([
          { ONERI: "AL", HEDEF_FIYAT: "425.55", GETIRI_POT: "41.85" },
        ]),
      });

    const tk = new Ticker("THYAO");
    const rec = await tk.recommendations;
    expect(rec).toEqual({
      recommendation: "AL",
      target_price: 425.55,
      upside_potential: 41.85,
    });

    // analystPriceTargets aliases priceTarget
    const ptSpy = jest
      .spyOn(tk, "priceTarget", "get")
      .mockResolvedValueOnce({
        current: 300,
        mean: 420,
        high: 500,
        low: 350,
        numberOfAnalysts: 12,
      });
    const apt = await tk.analystPriceTargets;
    expect(apt?.mean).toBe(420);
    expect(ptSpy).toHaveBeenCalled();

    // FastInfo extra getters
    const fi = tk.fastInfo;
    jest.spyOn(fi, "get").mockImplementation(async (key: string) => {
      const map: Record<string, unknown> = {
        timezone: "Europe/Istanbul",
        amount: 5000000,
        shares: 1380000000,
        freeFloat: 50.5,
        foreignRatio: 32.1,
      };
      return map[key];
    });
    expect(await fi.timezone).toBe("Europe/Istanbul");
    expect(await fi.amount).toBe(5000000);
    expect(await fi.shares).toBe(1380000000);
    expect(await fi.freeFloat).toBe(50.5);
    expect(await fi.foreignRatio).toBe(32.1);
  });

  test("TechnicalAnalyzer.all(), column param, and TechnicalMixin on all 6 asset classes", async () => {
    const candles = makeCandles(40);
    const ta = new TechnicalAnalyzer(candles);
    const allRows = ta.all({ indicators: ["sma", "rsi"] });
    expect(allRows).toHaveLength(40);
    expect(allRows[39]).toHaveProperty("sma_20");
    expect(allRows[39]).toHaveProperty("rsi_14");

    // Column parameter on indicators
    expect(calculateSMA(candles, 5, "open")).not.toEqual(
      calculateSMA(candles, 5, "high"),
    );
    expect(calculateEMA(candles, 5, "high")).toHaveLength(40);
    expect(calculateRSI(candles, 14, "open")).toHaveLength(40);
    expect(calculateMACD(candles, 12, 26, 9, "open")).toHaveLength(40);
    expect(calculateBollingerBands(candles, 20, 2, "high")).toHaveLength(40);
    expect(calculateTilsonT3(candles, 5, 0.7, "open")).toHaveLength(40);
    expect(calculateMOM(candles, 10, "high")).toHaveLength(40);
    expect(calculateROC(candles, 10, "low")).toHaveLength(40);
    expect(calculateWMA(candles, 10, "open")).toHaveLength(40);
    expect(calculateTEMA(candles, 10, "open")).toHaveLength(40);

    // All 6 classes extend TechnicalMixin
    const ticker = new Ticker("THYAO");
    const fx = new FX("USD");
    const crypto = new Crypto("BTCTRY");
    const idx = new Index("XU100");
    const fund = new Fund("TI1");
    const portfolio = new Portfolio("XU030");

    for (const inst of [ticker, fx, crypto, idx, fund, portfolio]) {
      expect(inst).toBeInstanceOf(TechnicalMixin);
    }

    jest.spyOn(ticker, "history").mockResolvedValue(candles);
    jest.spyOn(fx, "history").mockResolvedValue(candles);
    jest.spyOn(crypto, "history").mockResolvedValue(candles);
    jest.spyOn(idx, "history").mockResolvedValue(candles);
    jest.spyOn(fund, "history").mockResolvedValue(
      candles.map((c) => ({
        date: c.date,
        price: c.close,
        fundSize: 1e6,
        investors: 100,
      })),
    );
    jest.spyOn(portfolio, "history").mockResolvedValue(
      candles.map((c) => ({
        date: c.date,
        value: c.close * 10,
        dailyReturn: 0.5,
      })),
    );

    const st = await ticker.supertrend("3mo");
    expect(typeof st.direction).toBe("number");
    expect(typeof (await ticker.tilsonT3("3mo"))).toBe("number");
    expect((await ticker.historyWithIndicators("1mo")).length).toBe(40);

    expect(typeof (await fx.rsi("3mo"))).toBe("number");
    expect((await fx.technicals("3mo")).latest).toHaveProperty("rsi_14");
    expect(typeof (await crypto.sma("3mo"))).toBe("number");
    expect(typeof (await idx.ema("3mo"))).toBe("number");
    expect(typeof (await fund.rsi("3mo"))).toBe("number");
    expect(typeof (await portfolio.rsi("3mo"))).toBe("number");
  });

  test("FX static banks() and metalInstitutions()", () => {
    const dov = getDovizcomProvider();
    jest.spyOn(dov, "getBanks").mockReturnValueOnce(["akbank", "garanti"]);
    jest
      .spyOn(dov, "getMetalInstitutions")
      .mockReturnValueOnce(["gram-altin"]);

    expect(FX.banks()).toEqual(["akbank", "garanti"]);
    expect(FX.metalInstitutions()).toEqual(["gram-altin"]);
  });

  test("Portfolio benchmark ctor, targetWeights/holdings getters, multi-asset history & correlation, riskMetrics beta/alpha", async () => {
    const p = new Portfolio("XU030");
    expect(p.toDict().benchmark).toBe("XU030");

    p.add("USD", { shares: 10, cost: 30, assetType: "fx" });
    p.add("BTCTRY", { shares: 1, cost: 1000, assetType: "crypto" });
    p.setTargetWeights({ USD: 0.5, BTCTRY: 0.5 });
    expect(p.targetWeights).toEqual({ USD: 0.5, BTCTRY: 0.5 });

    const fxCandles = makeCandles(30);
    const cryptoCandles = makeCandles(30).map((c, i) => ({
      ...c,
      close: 1000 + i * 10 + Math.cos(i / 2) * 20,
    }));
    const benchCandles = makeCandles(30);

    jest.spyOn(FX.prototype, "history").mockResolvedValue(fxCandles);
    jest.spyOn(Crypto.prototype, "history").mockResolvedValue(cryptoCandles);
    jest.spyOn(Ticker.prototype, "history").mockResolvedValue(benchCandles);
    jest
      .spyOn(FX.prototype, "current", "get")
      .mockResolvedValue({ symbol: "USD", last: 35 });
    jest
      .spyOn(Crypto.prototype, "current", "get")
      .mockResolvedValue({ symbol: "BTCTRY", last: 1500 });

    const hist = await p.history("3mo");
    expect(hist.length).toBe(30);

    const corr = await p.correlationMatrix("3mo");
    expect(corr.USD?.USD).toBe(1);
    expect(typeof corr.USD?.BTCTRY).toBe("number");

    const rm = await p.riskMetrics("3mo", 0.28);
    expect(rm.riskFreeRate).toBeCloseTo(28, 6);
    expect(typeof rm.beta).toBe("number");
    expect(typeof rm.alpha).toBe("number");

    const holdings = await p.holdings;
    expect(holdings).toHaveLength(2);
  });

  test("screenStocks supports dynamic *_max-only filters", async () => {
    const sp = getScreenerProvider();
    jest.spyOn(sp, "getCriteria").mockResolvedValueOnce([]);
    const screenSpy = jest.spyOn(sp, "screen").mockResolvedValueOnce([]);

    await screenStocks({ foreign_ratio_max: 40 });
    expect(screenSpy).toHaveBeenCalled();
    const filtersArg = screenSpy.mock.calls[0][0] || [];
    const fr = filtersArg.find((f) => f[0] === "foreign_ratio");
    expect(fr).toBeDefined();
    expect(fr?.[2]).toBe("40");
  });

  test("TradingViewStream extensions: authToken, getters, callbacks, study wrappers, ping, lifecycle", () => {
    const stream = createStream("custom_token");
    expect(stream).toBeInstanceOf(TradingViewStream);
    expect(stream.isConnected).toBe(false);
    expect(stream.subscribedSymbols).toEqual([]);
    expect(stream.chartSubscriptions).toEqual([]);
    expect(stream.getAllQuotes()).toEqual({});

    const qCb = jest.fn();
    stream.onQuote("THYAO", qCb);
    stream.emit("quote", { symbol: "BIST:THYAO", lp: 300 });
    expect(qCb).toHaveBeenCalledTimes(1);
    stream.removeCallback("THYAO", qCb);
    stream.emit("quote", { symbol: "BIST:THYAO", lp: 305 });
    expect(qCb).toHaveBeenCalledTimes(1);

    const cCb = jest.fn();
    stream.onCandle("THYAO", "1m", cCb);
    stream.emit("candle", {
      symbol: "BIST:THYAO",
      interval: "1m",
      candle: { time: new Date(), open: 1, high: 2, low: 1, close: 2, volume: 0 },
    });
    expect(cCb).toHaveBeenCalledTimes(1);
    stream.removeCandleCallback("THYAO", "1m", cCb);
    stream.emit("candle", {
      symbol: "BIST:THYAO",
      interval: "1m",
      candle: { time: new Date(), open: 1, high: 2, low: 1, close: 2, volume: 0 },
    });
    expect(cCb).toHaveBeenCalledTimes(1);

    // Study wrappers & lifecycle handlers
    const errCb = jest.fn();
    stream.on("study_error", errCb);
    const internal = stream as unknown as {
      _handlePacket: (p: { m: string; p: unknown[] }) => void;
    };
    internal._handlePacket({ m: "study_error", p: ["cs", "st1", "bad study"] });
    expect(errCb).toHaveBeenCalledWith(
      expect.objectContaining({ studyId: "st1", error: "bad study" }),
    );
    expect(stream.getStudy("THYAO", "1d", "RSI")).toBeNull();
    expect(stream.getStudies("THYAO", "1d")).toEqual({});

    // ping on disconnected is safe
    stream.ping();
    return expect(stream.wait()).resolves.toBeUndefined();
  });

  test("Convenience aliases: calculateHeikinAshiVectorized, clearIndicatorCache, getSymbols, monthCodeToName, TTL, close()", async () => {
    const candles = makeCandles(5);
    expect(calculateHeikinAshiVectorized(candles)).toEqual(
      calculateHeikinAshi(candles),
    );
    expect(monthCodeToName("F")).toBe("January");
    expect(TTL.EVDS_CATALOG).toBe(86400);
    expect(TTL.SOCIAL_DATA).toBe(300);
    expect(TTL.COMPANY_INFO).toBe(3600);

    clearIndicatorCache();
    getPineFacadeProvider().close();
    getTEFASProvider().close();

    const searchProv = getSearchProvider();
    jest
      .spyOn(searchProv, "search")
      .mockResolvedValueOnce([
        {
          symbol: "THYAO",
          full_name: "BIST:THYAO",
          description: "THY",
          exchange: "BIST",
          type: "stock",
          currency: "TRY",
          country: "TR",
        },
      ]);
    const map = await searchProv.getSymbols(["THYAO"]);
    expect(map.THYAO?.full_name).toBe("BIST:THYAO");
  });
});
