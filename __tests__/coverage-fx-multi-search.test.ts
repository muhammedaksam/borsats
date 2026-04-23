// Mocked tests for fx.ts, multi.ts, search.ts, scanner.ts coverage

// --- FX Mocks ---
const mockCanliDovizCurrent = jest.fn().mockResolvedValue({ last: 35, symbol: "USD" });
const mockCanliDovizHistory = jest.fn().mockResolvedValue([
  { date: new Date(), open: 34, high: 36, low: 33, close: 35, volume: 0 },
]);
const mockDovizcomCurrent = jest.fn().mockResolvedValue({ last: 100, symbol: "BRENT" });
const mockDovizcomHistory = jest.fn().mockResolvedValue([
  { date: new Date(), open: 90, high: 110, low: 85, close: 100, volume: 0 },
]);
const mockDovizcomBankRates = jest.fn().mockResolvedValue([{ bank: "akbank", buy: 34, sell: 35 }]);
const mockDovizcomMetalRates = jest.fn().mockResolvedValue([{ institution: "kapalicarsi", buy: 3000, sell: 3100 }]);
const mockDovizcomInstHistory = jest.fn().mockResolvedValue([]);
const mockDovizcomBanks = jest.fn().mockReturnValue(["akbank", "garanti"]);
const mockDovizcomMetalInst = jest.fn().mockReturnValue(["kapalicarsi"]);

jest.mock("~/providers/canlidoviz", () => ({
  CanlidovizProvider: {
    CURRENCY_IDS: { USD: 1, EUR: 2 },
    METAL_IDS: { "gram-altin": 1 },
    ENERGY_IDS: {},
    COMMODITY_IDS: {},
  },
  getCanliDovizProvider: () => ({
    getCurrentRate: mockCanliDovizCurrent,
    getHistory: mockCanliDovizHistory,
  }),
}));

jest.mock("~/providers/dovizcom", () => ({
  getDovizcomProvider: () => ({
    getCurrent: mockDovizcomCurrent,
    getHistory: mockDovizcomHistory,
    getBankRates: mockDovizcomBankRates,
    getMetalInstitutionRates: mockDovizcomMetalRates,
    getMetalInstitutions: mockDovizcomMetalInst,
    getBanks: mockDovizcomBanks,
    getInstitutionHistory: mockDovizcomInstHistory,
  }),
}));

jest.mock("~/providers/tradingview", () => ({
  getTradingViewProvider: () => ({
    getHistory: jest.fn().mockResolvedValue([
      { date: new Date(), open: 34, high: 36, low: 33, close: 35, volume: 0 },
    ]),
  }),
}));

jest.mock("~/providers/tradingview-scanner", () => ({
  getScannerProvider: () => ({
    getTASignals: jest.fn().mockResolvedValue({
      summary: { recommendation: "BUY", buy: 10, sell: 2, neutral: 5 },
      oscillators: { recommendation: "BUY", values: {} },
      moving_averages: { recommendation: "BUY", values: {} },
    }),
  }),
  TASignals: {},
  INTERVAL_MAP: { "1m": "|1", "5m": "|5", "1h": "|60", "1d": "", "1w": "|1W", "1mo": "|1M" },
}));

// --- Search Mocks ---
jest.mock("~/providers/tradingview-search", () => ({
  getSearchProvider: () => ({
    search: jest.fn().mockResolvedValue([
      { symbol: "THYAO", full_name: "BIST:THYAO", description: "THY", exchange: "BIST", type: "stock", currency: "TRY", country: "TR" },
    ]),
    getVIOPContracts: jest.fn().mockResolvedValue([
      { symbol: "THYAOF25", is_continuous: false },
      { symbol: "THYAO!", is_continuous: true },
    ]),
  }),
}));

jest.mock("~/market", () => ({
  searchCompanies: jest.fn().mockResolvedValue([]),
}));

// --- Multi/Scanner Mocks ---
jest.mock("~/ticker", () => ({
  Ticker: jest.fn().mockImplementation(() => ({
    history: jest.fn().mockResolvedValue([
      { date: new Date(), open: 100, high: 105, low: 95, close: 102, volume: 1000 },
    ]),
  })),
}));

jest.mock("~/providers/bist-index", () => ({
  getBistIndexProvider: () => ({
    getComponents: jest.fn().mockResolvedValue([{ symbol: "THYAO" }, { symbol: "GARAN" }]),
  }),
}));

import { FX, banks, metalInstitutions } from "~/fx";
import { Tickers, download } from "~/multi";
import { search, searchBist, searchCrypto, searchForex, searchIndex, searchViop, viopContracts } from "~/search";
import { TechnicalScanner } from "~/scanner";

describe("FX Coverage", () => {
  test("current for CanliDoviz-supported asset", async () => {
    const fx = new FX("USD");
    const d = await fx.current;
    expect(d.last).toBe(35);
    // Second call uses cache
    const d2 = await fx.current;
    expect(d2).toEqual(d);
  });

  test("current for non-CanliDoviz asset uses dovizcom", async () => {
    const fx = new FX("BRENT");
    const d = await fx.current;
    expect(d.last).toBe(100);
  });

  test("info is alias for current", async () => {
    const fx = new FX("USD");
    const d = await fx.info;
    expect(d).toBeDefined();
  });

  test("bankRates", async () => {
    const fx = new FX("USD");
    const r = await fx.bankRates;
    expect(Array.isArray(r)).toBe(true);
  });

  test("bankRates wraps single result", async () => {
    mockDovizcomBankRates.mockResolvedValueOnce({ bank: "akbank", buy: 34, sell: 35 });
    const fx = new FX("EUR");
    const r = await fx.bankRates;
    expect(Array.isArray(r)).toBe(true);
  });

  test("institutionRates", async () => {
    const fx = new FX("gram-altin");
    const r = await fx.institutionRates();
    expect(Array.isArray(r)).toBe(true);
  });

  test("institutionRates wraps single", async () => {
    mockDovizcomMetalRates.mockResolvedValueOnce({ institution: "k", buy: 1, sell: 2 });
    const fx = new FX("gram-altin");
    const r = await fx.institutionRates();
    expect(Array.isArray(r)).toBe(true);
  });

  test("institutionRate found", async () => {
    const fx = new FX("gram-altin");
    const r = await fx.institutionRate("kapalicarsi");
    expect(r.institution).toBe("kapalicarsi");
  });

  test("institutionRate not found throws", async () => {
    const fx = new FX("gram-altin");
    await expect(fx.institutionRate("nonexistent")).rejects.toThrow("not found");
  });

  test("history intraday uses TradingView", async () => {
    const fx = new FX("USD");
    const h = await fx.history({ interval: "1h" });
    expect(Array.isArray(h)).toBe(true);
  });

  test("history intraday throws for unsupported asset", async () => {
    const fx = new FX("PLN");
    await expect(fx.history({ interval: "1h" })).rejects.toThrow("Intraday data not available");
  });

  test("history daily CanliDoviz", async () => {
    const fx = new FX("USD");
    const h = await fx.history({ interval: "1d" });
    expect(Array.isArray(h)).toBe(true);
  });

  test("history daily dovizcom fallback", async () => {
    const fx = new FX("BRENT");
    const h = await fx.history({ interval: "1d" });
    expect(Array.isArray(h)).toBe(true);
  });

  test("history with start/end", async () => {
    const fx = new FX("USD");
    const h = await fx.history({ start: "2024-01-01", end: "2024-02-01" });
    expect(Array.isArray(h)).toBe(true);
  });

  test("taSignals for currency", async () => {
    const fx = new FX("USD");
    const s = await fx.taSignals("1d");
    expect(s.summary).toBeDefined();
  });

  test("taSignals throws for unsupported", async () => {
    const fx = new FX("PLN");
    await expect(fx.taSignals()).rejects.toThrow("TA signals not available");
  });

  test("taSignalsAllTimeframes", async () => {
    const fx = new FX("USD");
    const all = await fx.taSignalsAllTimeframes();
    expect(all["1d"]).toHaveProperty("summary");
  });

  test("banks and metalInstitutions", () => {
    expect(banks()).toEqual(["akbank", "garanti"]);
    expect(metalInstitutions()).toEqual(["kapalicarsi"]);
  });

  test("institutionHistory for CanliDoviz asset", async () => {
    const fx = new FX("USD");
    const h = await fx.institutionHistory("akbank");
    expect(Array.isArray(h)).toBe(true);
  });

  test("institutionHistory CanliDoviz fallback to dovizcom", async () => {
    mockCanliDovizHistory.mockRejectedValueOnce(new Error("fail"));
    const fx = new FX("USD");
    const h = await fx.institutionHistory("akbank");
    expect(Array.isArray(h)).toBe(true);
  });

  test("institutionHistory for non-CanliDoviz asset", async () => {
    const fx = new FX("BRENT");
    const h = await fx.institutionHistory("akbank");
    expect(Array.isArray(h)).toBe(true);
  });
});

describe("Multi Coverage", () => {
  test("Tickers.history calls download", async () => {
    const t = new Tickers(["THYAO"]);
    const r = await t.history({ period: "1mo" });
    expect(r).toBeDefined();
  });

  test("download with string input", async () => {
    const r = await download("THYAO GARAN", { period: "1mo" });
    expect(r).toBeDefined();
  });

  test("download with onProgress callback", async () => {
    const progress: number[] = [];
    await download(["THYAO"], { period: "1mo", onProgress: (p) => progress.push(p) });
    expect(progress.length).toBeGreaterThan(0);
    expect(progress[progress.length - 1]).toBe(100);
  });
});

describe("Search Coverage", () => {
  test("search with empty query throws", async () => {
    await expect(search("")).rejects.toThrow("empty");
  });

  test("search returns symbols by default", async () => {
    const r = await search("THYAO");
    expect(Array.isArray(r)).toBe(true);
  });

  test("search with fullInfo returns objects", async () => {
    const r = await search("THYAO", { fullInfo: true });
    expect(Array.isArray(r)).toBe(true);
    if (r.length > 0) expect(r[0]).toHaveProperty("source");
  });

  test("searchBist", async () => {
    const r = await searchBist("THYAO");
    expect(Array.isArray(r)).toBe(true);
  });

  test("searchCrypto", async () => {
    const r = await searchCrypto("BTC");
    expect(Array.isArray(r)).toBe(true);
  });

  test("searchForex", async () => {
    const r = await searchForex("USD");
    expect(Array.isArray(r)).toBe(true);
  });

  test("searchIndex", async () => {
    const r = await searchIndex("XU100");
    expect(Array.isArray(r)).toBe(true);
  });

  test("searchViop", async () => {
    const r = await searchViop("THYAO");
    expect(Array.isArray(r)).toBe(true);
  });

  test("viopContracts returns symbols", async () => {
    const r = await viopContracts("THYAO");
    expect(Array.isArray(r)).toBe(true);
    // Filters out continuous
    expect(r).not.toContain("THYAO!");
  });

  test("viopContracts with fullInfo", async () => {
    const r = await viopContracts("THYAO", true);
    expect(Array.isArray(r)).toBe(true);
  });
});

describe("Scanner Coverage", () => {
  test("toString", () => {
    const s = new TechnicalScanner();
    s.addSymbol("THYAO");
    s.addCondition("rsi < 30");
    expect(s.toString()).toContain("symbols=1");
    expect(s.toString()).toContain("conditions=1");
  });

  test("_getRequiredHistoryLength returns 1d for intraday", () => {
    const s = new TechnicalScanner();
    s.setInterval("1h");
    // @ts-expect-error accessing private
    expect(s._getRequiredHistoryLength()).toBe("1d");
  });

  test("_getRequiredHistoryLength returns 1y for daily", () => {
    const s = new TechnicalScanner();
    s.setInterval("1d");
    // @ts-expect-error accessing private
    expect(s._getRequiredHistoryLength()).toBe("1y");
  });

  test("setUniverse with non-X string uses as single symbol", async () => {
    const s = new TechnicalScanner();
    await s.setUniverse("THYAO");
    expect(s.symbols).toEqual(["THYAO"]);
  });

  test("setUniverse with X-prefix resolves index components", async () => {
    const s = new TechnicalScanner();
    await s.setUniverse("XU030");
    expect(s.symbols).toContain("THYAO");
  });

  test("run with conditions executes full scan", async () => {
    const s = new TechnicalScanner();
    s.addSymbol("THYAO");
    s.addCondition("close > 0");
    const results = await s.run(10);
    // May or may not match depending on mock data
    expect(Array.isArray(results)).toBe(true);
  });

  test("removeCondition by condition string", () => {
    const s = new TechnicalScanner();
    s.addCondition("rsi < 30");
    s.addCondition("close > 50");
    s.removeCondition("rsi < 30");
    expect(s.conditions).not.toContain("rsi < 30");
    expect(s.conditions).toContain("close > 50");
  });

  test("addColumn prevents duplicates", () => {
    const s = new TechnicalScanner();
    s.addColumn("market_cap");
    s.addColumn("market_cap");
    // @ts-expect-error accessing private
    expect(s._extraColumns.length).toBe(1);
  });
});
