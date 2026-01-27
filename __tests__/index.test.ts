import * as borsats from "~/index";

describe("Library Exports", () => {
  test("should export Ticker and related", () => {
    expect(borsats.Ticker).toBeDefined();
    // Classes/Types that are just re-exported might need to be checked if they are values
    // FastInfo is a class, so it should be defined
    expect(borsats.FastInfo).toBeDefined();
  });

  test("should export Fund", () => {
    expect(borsats.Fund).toBeDefined();
  });

  test("should export Screener", () => {
    expect(borsats.Screener).toBeDefined();
  });

  test("should export Bond", () => {
    expect(borsats.Bond).toBeDefined();
  });

  test("should export Crypto", () => {
    expect(borsats.Crypto).toBeDefined();
  });

  test("should export FX", () => {
    expect(borsats.FX).toBeDefined();
  });

  test("should export Portfolio", () => {
    expect(borsats.Portfolio).toBeDefined();
  });

  test("should export TechnicalAnalyzer", () => {
    expect(borsats.TechnicalAnalyzer).toBeDefined();
  });

  test("should export BacktestEngine", () => {
    expect(borsats.BacktestEngine).toBeDefined();
  });

  test("should export TradingViewStream", () => {
    expect(borsats.TradingViewStream).toBeDefined();
  });

  test("should export ReplaySession", () => {
    expect(borsats.ReplaySession).toBeDefined();
  });

  test("should export Index (BIST)", () => {
    expect(borsats.Index).toBeDefined();
  });

  test("should export VIOP", () => {
    expect(borsats.VIOP).toBeDefined();
  });

  test("should export TCMB", () => {
    expect(borsats.TCMB).toBeDefined();
  });

  test("should export EconomicCalendar", () => {
    expect(borsats.EconomicCalendar).toBeDefined();
  });

  test("should export Providers", () => {
    expect(borsats.PineFacadeProvider).toBeDefined();
    expect(borsats.getPineFacadeProvider).toBeDefined();

    expect(borsats.TradingViewETFProvider).toBeDefined();
    expect(borsats.getTradingViewETFProvider).toBeDefined();

    expect(borsats.TradingViewScannerProvider).toBeDefined();
    expect(borsats.getScannerProvider).toBeDefined();

    expect(borsats.search).toBeDefined();
  });

  test("should export charts module", () => {
    expect(borsats.calculateHeikinAshi).toBeDefined();
  });
});
