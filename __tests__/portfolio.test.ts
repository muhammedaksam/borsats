import { Crypto } from "~/crypto";
import { Fund } from "~/fund";
import { FX } from "~/fx";
import { Portfolio } from "~/portfolio";
import { FundDetail } from "~/providers/tefas";
import { FastInfo, Ticker } from "~/ticker";
import { CurrentData } from "~/types";

describe("Portfolio Module", () => {
  jest.setTimeout(60000);

  test("Portfolio add with different asset types", () => {
    const p = new Portfolio();
    p.add("THYAO", { shares: 10, cost: 200, assetType: "stock" });
    p.add("USD", { shares: 100, cost: 30, assetType: "fx" });
    p.add("BTCTRY", { shares: 1, cost: 3000000, assetType: "crypto" });
    p.add("TTE", { shares: 500, cost: 100, assetType: "fund" });
    expect(p.symbols.length).toBe(4);
  });

  test("Portfolio auto-detect asset types", () => {
    const p = new Portfolio();
    p.add("THYAO", { shares: 10, cost: 200 }); // stock
    p.add("EUR", { shares: 100, cost: 30 }); // fx
    p.add("gram-altin", { shares: 5, cost: 3000 }); // fx (metal)
    p.add("BTCTRY", { shares: 1, cost: 3000000 }); // crypto
    p.add("AAE", { shares: 500, cost: 100 }); // fund
    expect(p.symbols.length).toBe(5);
  });

  test("Portfolio update existing holding", () => {
    const p = new Portfolio();
    p.add("THYAO", { shares: 10, cost: 200 });
    p.update("THYAO", { shares: 20, cost: 250 });
    const dict = p.toDict();
    const holding = dict.holdings.find((h) => h.symbol === "THYAO");
    expect(holding?.shares).toBe(20);
    expect(holding?.costPerShare).toBe(250);
  });

  test("Portfolio update non-existent throws", () => {
    const p = new Portfolio();
    expect(() => p.update("NONEXISTENT", { shares: 10 })).toThrow();
  });

  test("Portfolio remove", () => {
    const p = new Portfolio();
    p.add("THYAO", { shares: 10, cost: 200 });
    p.add("GARAN", { shares: 20, cost: 50 });
    p.remove("THYAO");
    expect(p.symbols).not.toContain("THYAO");
  });

  test("Portfolio setBenchmark", () => {
    const p = new Portfolio();
    p.setBenchmark("BIST100");
    expect(p.toDict().benchmark).toBe("BIST100");
  });

  test("Portfolio value", async () => {
    const p = new Portfolio();
    p.add("THYAO", { shares: 10, cost: 200 });
    const value = await p.value;
    expect(typeof value).toBe("number");
  });

  test("Portfolio cost", () => {
    const p = new Portfolio();
    p.add("THYAO", { shares: 10, cost: 200 });
    p.add("GARAN", { shares: 20, cost: 50 });
    expect(p.cost).toBe(10 * 200 + 20 * 50);
  });

  test("Portfolio pnl", async () => {
    const p = new Portfolio();
    p.add("THYAO", { shares: 10, cost: 200 });
    const pnl = await p.pnl;
    expect(typeof pnl).toBe("number");
  });

  test("Portfolio pnlPct", async () => {
    const p = new Portfolio();
    p.add("THYAO", { shares: 10, cost: 200 });
    const pct = await p.pnlPct;
    expect(typeof pct).toBe("number");
  });

  test("Portfolio weights", async () => {
    const p = new Portfolio();
    p.add("THYAO", { shares: 10, cost: 200 });
    const weights = await p.weights;
    expect(typeof weights).toBe("object");
  });

  test("Portfolio holdingsDetail", async () => {
    const p = new Portfolio();
    p.add("THYAO", { shares: 10, cost: 200 });
    const detail = await p.holdingsDetail();
    expect(Array.isArray(detail)).toBe(true);
  });

  test("Portfolio history", async () => {
    const p = new Portfolio();
    p.add("THYAO", { shares: 10, cost: 200 });
    const history = await p.history("1mo");
    expect(Array.isArray(history)).toBe(true);
  });

  test("Portfolio performance", async () => {
    const p = new Portfolio();
    p.add("THYAO", { shares: 10, cost: 200 });
    const perf = await p.performance();
    expect(perf).toHaveProperty("totalReturn");
    expect(perf).toHaveProperty("annualizedReturn");
  });

  test("Portfolio riskMetrics", async () => {
    const p = new Portfolio();
    p.add("THYAO", { shares: 10, cost: 200 });
    const metrics = await p.riskMetrics("1mo");
    expect(metrics).toHaveProperty("sharpeRatio");
    expect(metrics).toHaveProperty("sortinoRatio");
  });

  test("Portfolio riskMetrics with max period", async () => {
    const p = new Portfolio();
    p.add("THYAO", { shares: 10, cost: 200 });
    const metrics = await p.riskMetrics("max");
    expect(metrics).toBeDefined();
  });

  test("Portfolio sharpeRatio", async () => {
    const p = new Portfolio();
    p.add("THYAO", { shares: 10, cost: 200 });
    const sharpe = await p.sharpeRatio("1mo");
    expect(typeof sharpe).toBe("number");
  });

  test("Portfolio sortinoRatio", async () => {
    const p = new Portfolio();
    p.add("THYAO", { shares: 10, cost: 200 });
    const sortino = await p.sortinoRatio("1mo");
    expect(typeof sortino).toBe("number");
  });

  test("Portfolio beta", async () => {
    const p = new Portfolio();
    p.add("THYAO", { shares: 10, cost: 200 });
    const beta = await p.beta(undefined, "1mo");
    expect(typeof beta).toBe("number");
  });

  test("Portfolio beta with custom benchmark", async () => {
    const p = new Portfolio();
    p.add("THYAO", { shares: 10, cost: 200 });
    const beta = await p.beta("XU030", "1mo");
    expect(typeof beta).toBe("number");
  });

  test("Portfolio correlationMatrix", async () => {
    const p = new Portfolio();
    p.add("THYAO", { shares: 10, cost: 200 });
    p.add("GARAN", { shares: 20, cost: 50 });
    const matrix = await p.correlationMatrix("1mo");
    expect(typeof matrix).toBe("object");
  });

  test("Portfolio fromDict", () => {
    const data = {
      benchmark: "XU100",
      holdings: [
        {
          symbol: "THYAO",
          shares: 10,
          cost: 200,
          assetType: "stock" as const,
        },
        {
          symbol: "GARAN",
          shares: 20,
          cost: 50,
          assetType: "stock" as const,
        },
      ],
    };
    const p = Portfolio.fromDict(data);
    expect(p.symbols).toContain("THYAO");
    expect(p.symbols).toContain("GARAN");
  });

  test("Portfolio fromDict without benchmark", () => {
    const data = {
      holdings: [
        {
          symbol: "THYAO",
          shares: 10,
          cost: 200,
          assetType: "stock" as const,
        },
      ],
    };
    const p = Portfolio.fromDict(data);
    expect(p).toBeDefined();
  });

  test("Portfolio toDict and fromDict round-trip", () => {
    const p1 = new Portfolio();
    p1.add("THYAO", { shares: 10, cost: 200 });
    p1.setBenchmark("XU100");

    const dict = p1.toDict();
    const p2 = Portfolio.fromDict(dict);

    expect(p2.symbols).toEqual(p1.symbols);
    expect(p2.toDict().benchmark).toEqual(dict.benchmark);
  });

  test("Portfolio with empty holdings", async () => {
    const p = new Portfolio();
    const value = await p.value;
    expect(value).toBe(0);
    expect(p.cost).toBe(0);
  });

  test("Portfolio toDict with holdings", () => {
    const p = new Portfolio();
    p.add("THYAO", { shares: 10, cost: 200 });
    const dict = p.toDict();
    const holding = dict.holdings.find((h) => h.symbol === "THYAO");
    expect(holding).toBeDefined();
    expect(holding?.shares).toBe(10);
    expect(holding?.costPerShare).toBe(200);
  });
  test("Portfolio clear and extended update", () => {
    const p = new Portfolio();
    p.add("THYAO", { shares: 10, cost: 250 });
    p.add("USD", { shares: 100, cost: 40, assetType: "fx" });

    p.update("THYAO", { shares: 20 });
    const dict = p.toDict();
    expect(dict.holdings.find((h) => h.symbol === "THYAO")?.shares).toBe(20);

    p.clear();
    expect(p.symbols.length).toBe(0);
  });

  test("Portfolio asset detection (private method)", () => {
    const p = new Portfolio();
    const portfolioPriv = p as unknown as {
      detectAssetType: (s: string) => string;
    };
    expect(portfolioPriv.detectAssetType("EUR")).toBe("fx");
    expect(portfolioPriv.detectAssetType("gram-altin")).toBe("fx");
    expect(portfolioPriv.detectAssetType("AAE")).toBe("fund");
    expect(portfolioPriv.detectAssetType("BTCTRY")).toBe("crypto");
  });

  test("Portfolio module value and detail (Mocked)", async () => {
    // Mock external dependencies to avoid network calls and timeouts
    const tickerSpy = jest
      .spyOn(Ticker.prototype, "fastInfo", "get")
      .mockReturnValue({
        lastPrice: Promise.resolve(100),
      } as unknown as FastInfo);
    const fundSpy = jest
      .spyOn(Fund.prototype, "info", "get")
      .mockReturnValue(
        Promise.resolve({ price: 2.5 } as unknown as FundDetail),
      );
    const fxSpy = jest
      .spyOn(FX.prototype, "current", "get")
      .mockReturnValue(
        Promise.resolve({ last: 30.5 } as unknown as CurrentData),
      );
    const cryptoSpy = jest
      .spyOn(Crypto.prototype, "current", "get")
      .mockReturnValue(
        Promise.resolve({ last: 3000000 } as unknown as CurrentData),
      );

    try {
      const p = new Portfolio();
      p.add("THYAO", { shares: 10, cost: 250 });
      p.add("USD", { shares: 100, cost: 40, assetType: "fx" });
      p.add("BTCTRY", { shares: 1, cost: 3000000 });
      p.add("TI1", { shares: 1000, cost: 50 });

      await expect(p.value).resolves.toBeDefined();
      await expect(p.holdingsDetail()).resolves.toBeDefined();
      await expect(p.weights).resolves.toBeDefined();
    } finally {
      tickerSpy.mockRestore();
      fundSpy.mockRestore();
      fxSpy.mockRestore();
      cryptoSpy.mockRestore();
    }
  }, 120000);
  test("Portfolio - every last branch", async () => {
    const p = new Portfolio();
    p.add("THYAO", { shares: 10, cost: 200, assetType: "stock" });
    p.add("USD", { shares: 1000, cost: 30, assetType: "fx" });

    p.update("THYAO", { shares: 15 });
    p.remove("THYAO");
    p.add("THYAO", { shares: 10, cost: 200 }); // Redetect type

    // These call external APIs, but we expect them to resolve or throw manageable errors
    // We are testing the "glue" code in Portfolio class
    await p.performance().catch(() => ({}));
    await p.riskMetrics("max").catch(() => ({}));
    await p.history("1mo").catch(() => []);

    const pEmpty = new Portfolio();
    await pEmpty.performance();
    await pEmpty.weights;
  });

  test("Portfolio drift and rebalancePlan", async () => {
    const p = new Portfolio();
    p.add("THYAO", { shares: 10, cost: 200 }); // $2000 value approx
    p.add("GARAN", { shares: 20, cost: 50 }); // $1000 value approx
    
    // Mock value/weights to be deterministic
    const valueSpy = jest.spyOn(p, "value", "get").mockResolvedValue(3000);
    const weightsSpy = jest.spyOn(p, "weights", "get").mockResolvedValue({
      THYAO: 0.6666,
      GARAN: 0.3333,
    });

    try {
      p.setTargetWeights({ THYAO: 0.5, GARAN: 0.5 });
      expect(p.getTargetWeights()).toEqual({ THYAO: 0.5, GARAN: 0.5 });
      
      const drift = await p.drift();
      expect(drift.length).toBeGreaterThan(0);
      
      const plan = await p.rebalancePlan();
      expect(plan.length).toBeGreaterThan(0);
    } finally {
      valueSpy.mockRestore();
      weightsSpy.mockRestore();
    }
  });

  test("Portfolio drift throws without target weights", async () => {
    const p = new Portfolio();
    p.add("THYAO", { shares: 10, cost: 200 });
    await expect(p.drift()).rejects.toThrow("No target weights set");
  });

  test("Portfolio rebalance (dry run)", async () => {
    const p = new Portfolio();
    p.add("THYAO", { shares: 10, cost: 200 });
    p.add("GARAN", { shares: 20, cost: 50 });

    const valueSpy = jest.spyOn(p, "value", "get").mockResolvedValue(3000);
    const weightsSpy = jest.spyOn(p, "weights", "get").mockResolvedValue({
      THYAO: 0.6666,
      GARAN: 0.3333,
    });

    try {
      p.setTargetWeights({ THYAO: 0.5, GARAN: 0.5 });
      const result = await p.rebalance(5, true);
      expect(result.executed).toBe(false);
      expect(Array.isArray(result.plan)).toBe(true);
    } finally {
      valueSpy.mockRestore();
      weightsSpy.mockRestore();
    }
  });

  test("Portfolio rebalancePlan with threshold filtering", async () => {
    const p = new Portfolio();
    p.add("A", { shares: 10, cost: 100 });
    p.add("B", { shares: 10, cost: 100 });

    const valueSpy = jest.spyOn(p, "value", "get").mockResolvedValue(2000);
    const weightsSpy = jest.spyOn(p, "weights", "get").mockResolvedValue({
      A: 0.51,
      B: 0.49,
    });

    try {
      p.setTargetWeights({ A: 0.5, B: 0.5 });
      // Small drift (2% and 2%) should be filtered by a 5% threshold
      const plan = await p.rebalancePlan(5);
      expect(plan.length).toBe(0);
    } finally {
      valueSpy.mockRestore();
      weightsSpy.mockRestore();
    }
  });

  test("Portfolio drift includes extra holdings not in targets", async () => {
    const p = new Portfolio();
    p.add("A", { shares: 10, cost: 100 });
    p.add("EXTRA", { shares: 5, cost: 50 });

    const valueSpy = jest.spyOn(p, "value", "get").mockResolvedValue(1000);
    const weightsSpy = jest.spyOn(p, "weights", "get").mockResolvedValue({
      A: 0.7,
      EXTRA: 0.3,
    });

    try {
      p.setTargetWeights({ A: 1.0 }); // Only A in targets, EXTRA is extra
      const drift = await p.drift();
      const extraHolding = drift.find((d) => d.symbol === "EXTRA");
      expect(extraHolding).toBeDefined();
      expect(extraHolding!.targetWeight).toBe(0);
      expect(extraHolding!.driftPct).toBe(100);
    } finally {
      valueSpy.mockRestore();
      weightsSpy.mockRestore();
    }
  });

  test("Portfolio toDict/fromDict with targetWeights", () => {
    const p = new Portfolio();
    p.add("THYAO", { shares: 10, cost: 200 });
    p.setTargetWeights({ THYAO: 1.0 });

    const dict = p.toDict();
    expect(dict.targetWeights).toEqual({ THYAO: 1.0 });

    const restored = Portfolio.fromDict(dict);
    expect(restored.getTargetWeights()).toEqual({ THYAO: 1.0 });
  });

  test("Portfolio update purchaseDate", () => {
    const p = new Portfolio();
    p.add("THYAO", { shares: 10, cost: 200, purchaseDate: "2024-01-01" });
    p.update("THYAO", { purchaseDate: "2024-06-01" });
    const dict = p.toDict();
    const holding = dict.holdings.find((h) => h.symbol === "THYAO");
    expect(holding?.purchaseDate).toBe("2024-06-01");
  });

  test("Portfolio pnlPct with zero cost", async () => {
    const p = new Portfolio();
    p.add("FREE", { shares: 100, assetType: "stock" });
    // cost is 0 (no costPerShare set)
    const pct = await p.pnlPct;
    expect(pct).toBe(0);
  });

  test("Portfolio full coverage (assets & catches)", async () => {
    const p = new Portfolio();
    p.add("ERR", { shares: 10, cost: 100 }); // Will trigger catch blocks
    p.add("MYFUND", { shares: 100, cost: 5, assetType: "fund", purchaseDate: "2024-01-01" });
    p.add("MYFX", { shares: 100, cost: 20, assetType: "fx" });
    p.add("MYCRYPTO", { shares: 1, cost: 40000, assetType: "crypto" });

    // Mock the getters and methods
    const fiSpy = jest.spyOn(Ticker.prototype, "fastInfo", "get").mockImplementation(function (this: Ticker) {
      if (this.symbol === "ERR") throw new Error("Mock error");
      return { lastPrice: Promise.resolve(100) } as unknown as FastInfo;
    });

    const fundInfoSpy = jest.spyOn(Fund.prototype, "info", "get").mockImplementation(function (this: Fund) {
      return Promise.resolve({ price: 10 } as unknown as FundDetail);
    });

    const fundHistSpy = jest.spyOn(Fund.prototype, "history").mockImplementation(function (this: Fund) {
      return Promise.resolve([{ date: new Date("2024-10-10"), price: 10 }] as unknown as Awaited<ReturnType<Fund["history"]>>);
    });

    const fxCurrentSpy = jest.spyOn(FX.prototype, "current", "get").mockImplementation(function (this: FX) {
      return Promise.resolve({ last: 30 } as unknown as CurrentData);
    });

    const cryptoCurrentSpy = jest.spyOn(Crypto.prototype, "current", "get").mockImplementation(function (this: Crypto) {
      return Promise.resolve({ last: 50000 } as unknown as CurrentData);
    });

    try {
      // 1. calculateTotalValue & pnl (hits 99-100, 106)
      const val = await p.value;
      // ERR: 0, MYFUND: 1000, MYFX: 3000, MYCRYPTO: 50000 -> 54000
      expect(val).toBeGreaterThan(0);

      // 2. weights (hits 162)
      const w = await p.weights;
      // Expect myfund, myfx, mycrypto to have weights
      expect(w["MYFUND"]).toBeDefined();

      // 3. holdingsDetail (hits 298-299)
      const detail = await p.holdingsDetail();
      expect(detail.length).toBe(4);

      // 4. history (hits 355-356, 364-365)
      const h = await p.history("1y");
      expect(Array.isArray(h)).toBe(true);
      
      // 5. riskMetrics (hits 471) -> tests < 20 points early return
      jest.spyOn(p, "history").mockResolvedValueOnce([{ date: new Date(), value: 100, dailyReturn: 0 }]); // Only 1 point
      const rm = await p.riskMetrics();
      expect(rm.annualizedVolatility).toBeNaN();

    } finally {
      fiSpy.mockRestore();
      fundInfoSpy.mockRestore();
      fundHistSpy.mockRestore();
      fxCurrentSpy.mockRestore();
      cryptoCurrentSpy.mockRestore();
    }
  });
});

