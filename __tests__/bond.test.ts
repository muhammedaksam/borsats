import { Bond, bonds, riskFreeRate } from "@/bond";

describe("Bond Module", () => {
  jest.setTimeout(60000);

  test("Bond class constructor", () => {
    const b = new Bond("10Y");
    expect(b.maturity).toBe("10Y");
  });

  test("Bond maturity case insensitive", () => {
    const b = new Bond("2y");
    expect(b.maturity).toBe("2Y");
  });

  test("Bond.MATURITIES static property", () => {
    expect(Bond.MATURITIES).toContain("2Y");
    expect(Bond.MATURITIES).toContain("5Y");
    expect(Bond.MATURITIES).toContain("10Y");
  });

  test("Bond name property", async () => {
    const b = new Bond("10Y");
    const name = await b.name;
    expect(typeof name).toBe("string");
  });

  test("Bond yieldRate property", async () => {
    const b = new Bond("10Y");
    const rate = await b.yieldRate;
    expect(rate === null || typeof rate === "number").toBe(true);
  });

  test("Bond yieldDecimal property", async () => {
    const b = new Bond("10Y");
    const decimal = await b.yieldDecimal;
    expect(decimal === null || typeof decimal === "number").toBe(true);
  });

  test("Bond change property", async () => {
    const b = new Bond("10Y");
    const change = await b.change;
    expect(change === null || typeof change === "number").toBe(true);
  });

  test("Bond changePct property", async () => {
    const b = new Bond("10Y");
    const changePct = await b.changePct;
    expect(changePct === null || typeof changePct === "number").toBe(true);
  });

  test("Bond info property", async () => {
    const b = new Bond("10Y");
    const info = await b.info;
    expect(info === null || typeof info === "object").toBe(true);
  });

  test("Bond with 2Y maturity", async () => {
    const b = new Bond("2Y");
    expect(b.maturity).toBe("2Y");
    const name = await b.name;
    expect(typeof name).toBe("string");
  });

  test("Bond with 5Y maturity", async () => {
    const b = new Bond("5Y");
    expect(b.maturity).toBe("5Y");
    const rate = await b.yieldRate;
    expect(rate === null || typeof rate === "number").toBe(true);
  });

  test("Bond with 30Y maturity", async () => {
    const b = new Bond("30Y");
    expect(b.maturity).toBe("30Y");
  });

  test("bonds function", async () => {
    const allBonds = await bonds();
    expect(Array.isArray(allBonds)).toBe(true);
  });

  test("riskFreeRate function", async () => {
    const rate = await riskFreeRate();
    expect(rate === null || typeof rate === "number").toBe(true);
  });
});
