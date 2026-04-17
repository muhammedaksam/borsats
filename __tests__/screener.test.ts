import {
  Screener,
  screenerCriteria,
  screenStocks,
  sectors,
  stockIndices,
} from "~/screener";
import { resilientTest } from "./helpers/network-utils";

describe("Screener Module", () => {
  jest.setTimeout(60000);

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

  test(
    "Screener run with filters",
    resilientTest(async () => {
      const s = new Screener();
      await s.addFilter("pe", 0, 20);
      const results = await s.run();
      expect(Array.isArray(results)).toBe(true);
    }),
  );

  test(
    "Screener run without filters",
    resilientTest(async () => {
      const s = new Screener();
      const results = await s.run();
      expect(Array.isArray(results)).toBe(true);
    }),
  );

  test(
    "screenStocks function basic",
    resilientTest(async () => {
      const results = await screenStocks({});
      expect(Array.isArray(results)).toBe(true);
    }),
  );

  test(
    "screenStocks with sector",
    resilientTest(async () => {
      const results = await screenStocks({ sector: "BANKA" });
      expect(Array.isArray(results)).toBe(true);
    }),
  );

  test(
    "screenStocks with index",
    resilientTest(async () => {
      const results = await screenStocks({ index: "XU030" });
      expect(Array.isArray(results)).toBe(true);
    }),
  );

  test(
    "screenStocks with recommendation",
    resilientTest(async () => {
      const results = await screenStocks({ recommendation: "BUY" });
      expect(Array.isArray(results)).toBe(true);
    }),
  );

  test(
    "screenStocks with market_cap filters",
    resilientTest(async () => {
      const results = await screenStocks({
        market_cap_min: 100,
        market_cap_max: 5000,
      });
      expect(Array.isArray(results)).toBe(true);
    }),
  );

  test(
    "screenStocks with pe filters",
    resilientTest(async () => {
      const results = await screenStocks({ pe_min: 0, pe_max: 20 });
      expect(Array.isArray(results)).toBe(true);
    }),
  );

  test(
    "screenStocks with dividend_yield filters",
    resilientTest(async () => {
      const results = await screenStocks({
        dividend_yield_min: 1,
        dividend_yield_max: 10,
      });
      expect(Array.isArray(results)).toBe(true);
    }),
  );

  test(
    "screenStocks with arbitrary _min filters",
    resilientTest(async () => {
      const results = await screenStocks({
        roe_min: 10,
        roe_max: 50,
      });
      expect(Array.isArray(results)).toBe(true);
    }),
  );

  test(
    "screenerCriteria function",
    resilientTest(async () => {
      const criteria = await screenerCriteria();
      expect(Array.isArray(criteria)).toBe(true);
    }),
  );

  test(
    "sectors function",
    resilientTest(async () => {
      const sectorList = await sectors();
      expect(Array.isArray(sectorList)).toBe(true);
    }),
  );

  test(
    "stockIndices function",
    resilientTest(async () => {
      const indices = await stockIndices();
      expect(Array.isArray(indices)).toBe(true);
    }),
  );
});
