import { TCMB, policyRate as tcmbPolicyRate } from "@/tcmb";

describe("TCMB Module", () => {
  jest.setTimeout(60000);

  test("TCMB policyRate", async () => {
    const t = new TCMB();
    const rate = await t.policyRate;
    expect(rate === null || typeof rate === "number").toBe(true);
  });

  test("TCMB overnight rates", async () => {
    const t = new TCMB();
    const rates = await t.overnight;
    expect(rates).toHaveProperty("borrowing");
    expect(rates).toHaveProperty("lending");
  });

  test("TCMB lateLiquidity rates", async () => {
    const t = new TCMB();
    const rates = await t.lateLiquidity;
    expect(rates).toHaveProperty("borrowing");
    expect(rates).toHaveProperty("lending");
  });

  test("TCMB rates property", async () => {
    const t = new TCMB();
    const rates = await t.rates;
    expect(Array.isArray(rates)).toBe(true);
  });

  test("TCMB history with policy rate", async () => {
    const t = new TCMB();
    const history = await t.history("policy", "1mo");
    expect(Array.isArray(history)).toBe(true);
  });

  test("TCMB history with overnight rate", async () => {
    const t = new TCMB();
    const history = await t.history("overnight", "3mo");
    expect(Array.isArray(history)).toBe(true);
  });

  test("TCMB history with late_liquidity rate", async () => {
    const t = new TCMB();
    const history = await t.history("late_liquidity", "1y");
    expect(Array.isArray(history)).toBe(true);
  });

  test("TCMB history with max period", async () => {
    const t = new TCMB();
    const history = await t.history("policy", "max");
    expect(Array.isArray(history)).toBe(true);
  });

  test("TCMB history with various periods", async () => {
    const t = new TCMB();
    for (const period of ["1w", "6mo", "2y", "5y", "10y"]) {
      const h = await t.history("policy", period);
      expect(Array.isArray(h)).toBe(true);
    }
  });

  test("tcmbPolicyRate helper function", async () => {
    const rate = await tcmbPolicyRate();
    expect(rate === null || typeof rate === "number").toBe(true);
  });
});
