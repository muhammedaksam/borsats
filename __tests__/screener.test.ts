import { Screener } from "~/screener";

describe("Screener Module", () => {
  test("Screener constructor", () => {
    const s = new Screener();
    expect(s).toBeDefined();
  });

  test("Screener CRITERIA_DEFAULTS static", () => {
    expect(Screener.CRITERIA_DEFAULTS).toHaveProperty("price");
    expect(Screener.CRITERIA_DEFAULTS).toHaveProperty("pe");
    expect(Screener.CRITERIA_DEFAULTS).toHaveProperty("market_cap");
  });

  test("Screener TEMPLATES static", () => {
    expect(Screener.TEMPLATES).toContain("small_cap");
    expect(Screener.TEMPLATES).toContain("high_dividend");
  });

  test("Screener addFilter with min and max", async () => {
    const s = new Screener();
    await s.addFilter("price", 10, 100);
    expect(s).toBeDefined();
  });

  test("Screener addFilter with required flag", async () => {
    const s = new Screener();
    await s.addFilter("pe", 5, 15, true);
    expect(s).toBeDefined();
  });

  test("Screener addFilter with only min", async () => {
    const s = new Screener();
    await s.addFilter("market_cap", 100, undefined);
    expect(s).toBeDefined();
  });

  test("Screener addFilter with only max", async () => {
    const s = new Screener();
    await s.addFilter("dividend_yield", undefined, 10);
    expect(s).toBeDefined();
  });

  test("Screener addFilter with no min/max (defaults)", async () => {
    const s = new Screener();
    await s.addFilter("roe");
    expect(s).toBeDefined();
  });

  test("Screener addFilter with unknown criteria", async () => {
    const s = new Screener();
    await s.addFilter("unknown_criteria_xyz");
    expect(s).toBeDefined();
  });

  test("Screener setSector", () => {
    const s = new Screener();
    const result = s.setSector("BANKA");
    expect(result).toBe(s);
  });

  test("Screener setIndex", () => {
    const s = new Screener();
    const result = s.setIndex("XU030");
    expect(result).toBe(s);
  });

  test("Screener setRecommendation", () => {
    const s = new Screener();
    const result = s.setRecommendation("BUY");
    expect(result).toBe(s);
  });

  test("Screener clear", async () => {
    const s = new Screener();
    await s.addFilter("price", 10, 100);
    s.setSector("BANKA");
    s.clear();
    expect(s).toBeDefined();
  });
});
