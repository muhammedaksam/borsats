import { banks, FX, metalInstitutions } from "@/fx";

describe("FX Module", () => {
  jest.setTimeout(60000);

  test("FX constructor and properties", () => {
    const fx = new FX("USD");
    expect(fx.asset).toBe("USD");
    expect(fx.symbol).toBe("USD");
  });

  test("FX current rate", async () => {
    const fx = new FX("USD");
    const current = await fx.current;
    expect(current).toBeDefined();
  });

  test("FX info (alias for current)", async () => {
    const fx = new FX("EUR");
    const info = await fx.info;
    expect(info).toBeDefined();
  });

  test("FX current cache hit", async () => {
    const fx = new FX("USD");
    await fx.current; // First call
    const cached = await fx.current; // Cache hit
    expect(cached).toBeDefined();
  });

  test("FX bankRates", async () => {
    const fx = new FX("USD");
    const rates = await fx.bankRates;
    expect(Array.isArray(rates)).toBe(true);
  });

  test("FX institutionRates", async () => {
    const fx = new FX("ons-altin");
    const rates = await fx.institutionRates();
    expect(Array.isArray(rates)).toBe(true);
  });

  test("FX history with daily interval", async () => {
    const fx = new FX("USD");
    const history = await fx.history({ period: "1mo", interval: "1d" });
    expect(Array.isArray(history)).toBe(true);
  });

  test("FX history with intraday interval via TradingView", async () => {
    const fx = new FX("USD");
    const history = await fx.history({
      interval: "1h",
      start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      end: new Date(),
    });
    expect(Array.isArray(history)).toBe(true);
  });

  test("FX history commodity via CanliDoviz", async () => {
    const fx = new FX("ons-altin");
    const history = await fx.history({ period: "1mo" });
    expect(Array.isArray(history)).toBe(true);
  });

  test("FX history non-supported intraday throws", async () => {
    const fx = new FX("NONEXISTENT");
    await expect(fx.history({ interval: "5m" })).rejects.toThrow();
  });

  test("FX with EUR", async () => {
    const fx = new FX("EUR");
    const current = await fx.current;
    expect(current).toBeDefined();
  });

  test("FX with GBP", async () => {
    const fx = new FX("GBP");
    const current = await fx.current;
    expect(current).toBeDefined();
  });

  test("FX commodity XAU via TradingView", async () => {
    const fx = new FX("XAU");
    // XAU needs intraday interval to use TradingView
    const history = await fx.history({ interval: "1h" });
    expect(Array.isArray(history)).toBe(true);
  });

  test("FX commodity XAG via TradingView", async () => {
    const fx = new FX("XAG");
    // XAG needs intraday interval to use TradingView
    const history = await fx.history({ interval: "1h" });
    expect(Array.isArray(history)).toBe(true);
  });

  test("FX energy BRENT", async () => {
    const fx = new FX("BRENT");
    await expect(fx.history({ interval: "1h" })).resolves.toBeDefined();
  });

  test("banks function", async () => {
    const bankList = await banks();
    expect(bankList).toBeDefined();
  });

  test("metalInstitutions function", async () => {
    const institutions = await metalInstitutions();
    expect(institutions).toBeDefined();
  });
});
