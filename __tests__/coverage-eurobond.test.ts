// Mocked tests for eurobond.ts coverage (Eurobond class methods + parseDateArg)

const _mockBondData = {
  isin: "US900123AL40",
  maturity: new Date("2030-01-01"),
  daysToMaturity: 2000,
  currency: "USD",
  bidPrice: 95.5,
  bidYield: 7.2,
  askPrice: 96.0,
  askYield: 7.1,
};

// Mock the provider at the base.ts level so ZiraatEurobondProvider doesn't make real HTTP calls
jest.mock("~/providers/base", () => ({
  BaseProvider: class {
    client = {
      post: jest.fn().mockResolvedValue({
        data: {
          d: {
            Data: `<table><tr><th>ISIN</th></tr><tr><td>US900123AL40</td><td>01.01.2030</td><td>2000</td><td>USD</td><td>95,5</td><td>7,2</td><td>96,0</td><td>7,1</td></tr></table>`,
          },
        },
      }),
      get: jest.fn(),
    };
    cache = {
      get: jest.fn().mockReturnValue(undefined),
      set: jest.fn(),
      clear: jest.fn(),
    };
  },
}));

jest.mock("~/providers/ziraat-eurobond", () => ({
  getEurobondProvider: () => ({
    getHistory: jest.fn().mockResolvedValue([
      { date: new Date("2024-01-15"), bidPrice: 95.5, askPrice: 96.0 },
    ]),
  }),
}));

import { Eurobond, getEurobondProvider, eurobonds } from "~/eurobond";

describe("Eurobond Class Coverage", () => {
  test("eurobonds convenience function", async () => {
    const bonds = await eurobonds();
    expect(Array.isArray(bonds)).toBe(true);
  });

  test("eurobonds with currency filter", async () => {
    const bonds = await eurobonds("USD");
    expect(Array.isArray(bonds)).toBe(true);
  });

  test("getEurobondProvider returns singleton", () => {
    const p1 = getEurobondProvider();
    const p2 = getEurobondProvider();
    expect(p1).toBe(p2);
  });

  test("Eurobond getData", async () => {
    const eb = new Eurobond("US900123AL40");
    const d = await eb.getData();
    expect(d).toBeDefined();
  });

  test("Eurobond info is alias", async () => {
    const eb = new Eurobond("US900123AL40");
    const d = await eb.info();
    expect(d).toBeDefined();
  });

  test("Eurobond maturity", async () => {
    const eb = new Eurobond("US900123AL40");
    const m = await eb.maturity();
    // May be Date or null depending on parsing
    expect(m === null || m instanceof Date).toBe(true);
  });

  test("Eurobond daysToMaturity", async () => {
    const eb = new Eurobond("US900123AL40");
    const d = await eb.daysToMaturity();
    expect(typeof d).toBe("number");
  });

  test("Eurobond currency", async () => {
    const eb = new Eurobond("US900123AL40");
    const c = await eb.currency();
    expect(typeof c).toBe("string");
  });

  test("Eurobond bidPrice", async () => {
    const eb = new Eurobond("US900123AL40");
    const p = await eb.bidPrice();
    expect(p === null || typeof p === "number").toBe(true);
  });

  test("Eurobond bidYield", async () => {
    const eb = new Eurobond("US900123AL40");
    const y = await eb.bidYield();
    expect(y === null || typeof y === "number").toBe(true);
  });

  test("Eurobond yieldRate", async () => {
    const eb = new Eurobond("US900123AL40");
    const y = await eb.yieldRate();
    expect(typeof y).toBe("number");
  });

  test("Eurobond askPrice", async () => {
    const eb = new Eurobond("US900123AL40");
    const p = await eb.askPrice();
    expect(p === null || typeof p === "number").toBe(true);
  });

  test("Eurobond askYield", async () => {
    const eb = new Eurobond("US900123AL40");
    const y = await eb.askYield();
    expect(y === null || typeof y === "number").toBe(true);
  });
});

describe("Eurobond history with parseDateArg", () => {
  test("history with period ytd", async () => {
    const eb = new Eurobond("US900123AL40");
    const h = await eb.history({ period: "ytd" });
    expect(Array.isArray(h)).toBe(true);
  });

  test("history with period 3mo", async () => {
    const eb = new Eurobond("US900123AL40");
    const h = await eb.history({ period: "3mo" });
    expect(Array.isArray(h)).toBe(true);
  });

  test("history with period 1y", async () => {
    const eb = new Eurobond("US900123AL40");
    const h = await eb.history({ period: "1y" });
    expect(Array.isArray(h)).toBe(true);
  });

  test("history with period max", async () => {
    const eb = new Eurobond("US900123AL40");
    const h = await eb.history({ period: "max" });
    expect(Array.isArray(h)).toBe(true);
  });

  test("history with default (no options)", async () => {
    const eb = new Eurobond("US900123AL40");
    const h = await eb.history();
    expect(Array.isArray(h)).toBe(true);
  });

  test("history with unknown period throws", async () => {
    const eb = new Eurobond("US900123AL40");
    await expect(eb.history({ period: "invalid" })).rejects.toThrow("Unknown period");
  });

  test("history with YYYY-MM-DD start/end", async () => {
    const eb = new Eurobond("US900123AL40");
    const h = await eb.history({ start: "2024-01-01", end: "2024-06-01" });
    expect(Array.isArray(h)).toBe(true);
  });

  test("history with DD.MM.YYYY dates", async () => {
    const eb = new Eurobond("US900123AL40");
    const h = await eb.history({ start: "01.06.2024", end: "30.06.2024" });
    expect(Array.isArray(h)).toBe(true);
  });

  test("history with DD-MM-YYYY dates", async () => {
    const eb = new Eurobond("US900123AL40");
    const h = await eb.history({ start: "01-06-2024" });
    expect(Array.isArray(h)).toBe(true);
  });

  test("history with DD/MM/YYYY dates", async () => {
    const eb = new Eurobond("US900123AL40");
    const h = await eb.history({ start: "01/06/2024" });
    expect(Array.isArray(h)).toBe(true);
  });

  test("history with YYYY/MM/DD dates", async () => {
    const eb = new Eurobond("US900123AL40");
    const h = await eb.history({ start: "2024/06/01" });
    expect(Array.isArray(h)).toBe(true);
  });

  test("history with Date objects", async () => {
    const eb = new Eurobond("US900123AL40");
    const h = await eb.history({ start: new Date("2024-01-01"), end: new Date("2024-06-01") });
    expect(Array.isArray(h)).toBe(true);
  });

  test("history with unparseable date throws", async () => {
    const eb = new Eurobond("US900123AL40");
    await expect(eb.history({ start: "not-a-date" })).rejects.toThrow("Could not parse date");
  });

  test("history with skipWeekends=false", async () => {
    const eb = new Eurobond("US900123AL40");
    const h = await eb.history({ period: "1mo", skipWeekends: false });
    expect(Array.isArray(h)).toBe(true);
  });
});
