import { Portfolio } from "~/portfolio";
import { resilientTest } from "../helpers/network-utils";

describe("Portfolio Module (Integration)", () => {
  jest.setTimeout(120000);

  test(
    "Portfolio value",
    resilientTest(async () => {
      const p = new Portfolio();
      p.add("THYAO", { shares: 10, cost: 200 });
      const value = await p.value;
      expect(typeof value).toBe("number");
    }, 1),
  );

  test(
    "Portfolio pnl",
    resilientTest(async () => {
      const p = new Portfolio();
      p.add("THYAO", { shares: 10, cost: 200 });
      const pnl = await p.pnl;
      expect(typeof pnl).toBe("number");
    }, 1),
  );

  test(
    "Portfolio pnlPct",
    resilientTest(async () => {
      const p = new Portfolio();
      p.add("THYAO", { shares: 10, cost: 200 });
      const pct = await p.pnlPct;
      expect(typeof pct).toBe("number");
    }, 1),
  );

  test(
    "Portfolio weights",
    resilientTest(async () => {
      const p = new Portfolio();
      p.add("THYAO", { shares: 10, cost: 200 });
      const weights = await p.weights;
      expect(typeof weights).toBe("object");
    }, 1),
  );

  test(
    "Portfolio holdingsDetail",
    resilientTest(async () => {
      const p = new Portfolio();
      p.add("THYAO", { shares: 10, cost: 200 });
      const detail = await p.holdingsDetail();
      expect(Array.isArray(detail)).toBe(true);
    }, 1),
  );

  test(
    "Portfolio history",
    resilientTest(async () => {
      const p = new Portfolio();
      p.add("THYAO", { shares: 10, cost: 200 });
      const history = await p.history("1mo");
      expect(Array.isArray(history)).toBe(true);
    }, 1),
  );

  test(
    "Portfolio performance",
    resilientTest(async () => {
      const p = new Portfolio();
      p.add("THYAO", { shares: 10, cost: 200 });
      const perf = await p.performance();
      expect(perf).toHaveProperty("totalReturn");
      expect(perf).toHaveProperty("annualizedReturn");
    }, 1),
  );

  test(
    "Portfolio riskMetrics",
    resilientTest(async () => {
      const p = new Portfolio();
      p.add("THYAO", { shares: 10, cost: 200 });
      const metrics = await p.riskMetrics("1mo");
      expect(metrics).toHaveProperty("sharpeRatio");
      expect(metrics).toHaveProperty("sortinoRatio");
    }, 1),
  );

  test(
    "Portfolio riskMetrics with max period",
    resilientTest(async () => {
      const p = new Portfolio();
      p.add("THYAO", { shares: 10, cost: 200 });
      const metrics = await p.riskMetrics("max");
      expect(metrics).toBeDefined();
    }, 1),
  );

  test(
    "Portfolio sharpeRatio",
    resilientTest(async () => {
      const p = new Portfolio();
      p.add("THYAO", { shares: 10, cost: 200 });
      const sharpe = await p.sharpeRatio("1mo");
      expect(typeof sharpe).toBe("number");
    }, 1),
  );

  test(
    "Portfolio sortinoRatio",
    resilientTest(async () => {
      const p = new Portfolio();
      p.add("THYAO", { shares: 10, cost: 200 });
      const sortino = await p.sortinoRatio("1mo");
      expect(typeof sortino).toBe("number");
    }, 1),
  );

  test(
    "Portfolio beta",
    resilientTest(async () => {
      const p = new Portfolio();
      p.add("THYAO", { shares: 10, cost: 200 });
      const beta = await p.beta(undefined, "1mo");
      expect(typeof beta).toBe("number");
    }, 1),
  );

  test(
    "Portfolio beta with custom benchmark",
    resilientTest(async () => {
      const p = new Portfolio();
      p.add("THYAO", { shares: 10, cost: 200 });
      const beta = await p.beta("XU030", "1mo");
      expect(typeof beta).toBe("number");
    }, 1),
  );

  test(
    "Portfolio correlationMatrix",
    resilientTest(async () => {
      const p = new Portfolio();
      p.add("THYAO", { shares: 10, cost: 200 });
      p.add("GARAN", { shares: 20, cost: 50 });
      const matrix = await p.correlationMatrix("1mo");
      expect(typeof matrix).toBe("object");
    }, 1),
  );

  test(
    "Portfolio - every last branch",
    resilientTest(async () => {
      const p = new Portfolio();
      p.add("THYAO", { shares: 10, cost: 200, assetType: "stock" });
      p.add("USD", { shares: 1000, cost: 30, assetType: "fx" });

      p.update("THYAO", { shares: 15 });
      p.remove("THYAO");
      p.add("THYAO", { shares: 10, cost: 200 });

      await p.performance().catch(() => ({}));
      await p.riskMetrics("max").catch(() => ({}));
      await p.history("1mo").catch(() => []);

      const pEmpty = new Portfolio();
      await pEmpty.performance();
      await pEmpty.weights;
    }, 1),
  );
});
