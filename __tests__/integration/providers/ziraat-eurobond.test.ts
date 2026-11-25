import { ZiraatEurobondProvider } from "~/providers/ziraat-eurobond";
import { resilientTest } from "../../helpers/network-utils";

describe("ZiraatEurobondProvider Integration", () => {
  let provider: ZiraatEurobondProvider;

  beforeEach(() => {
    provider = new ZiraatEurobondProvider();
  });

  test(
    "getEurobonds fetches real data",
    resilientTest(async () => {
      const bonds = await provider.getEurobonds();
      expect(Array.isArray(bonds)).toBe(true);

      if (bonds.length > 0) {
        const bond = bonds[0];
        expect(bond).toHaveProperty("isin");
        expect(bond).toHaveProperty("maturity");
        expect(bond).toHaveProperty("daysToMaturity");
        expect(bond).toHaveProperty("currency");
        expect(bond).toHaveProperty("bidPrice");
        expect(bond).toHaveProperty("bidYield");
        expect(bond).toHaveProperty("askPrice");
        expect(bond).toHaveProperty("askYield");
        expect(typeof bond.isin).toBe("string");
        expect(typeof bond.currency).toBe("string");
        expect(typeof bond.daysToMaturity).toBe("number");
      }
    }, 1),
    30000,
  );

  test(
    "getEurobonds filters by USD currency",
    resilientTest(async () => {
      const bonds = await provider.getEurobonds("USD");
      expect(Array.isArray(bonds)).toBe(true);
      bonds.forEach((bond) => {
        expect(bond.currency).toBe("USD");
      });
    }, 1),
    30000,
  );

  test(
    "getEurobonds filters by EUR currency",
    resilientTest(async () => {
      const bonds = await provider.getEurobonds("EUR");
      expect(Array.isArray(bonds)).toBe(true);
      bonds.forEach((bond) => {
        expect(bond.currency).toBe("EUR");
      });
    }, 1),
    15000,
  );

  test(
    "getEurobonds uses cache on second call",
    resilientTest(async () => {
      const bonds1 = await provider.getEurobonds();
      const start = Date.now();
      const bonds2 = await provider.getEurobonds();
      const elapsed = Date.now() - start;

      expect(bonds2).toEqual(bonds1);
      expect(elapsed).toBeLessThan(100);
    }, 1),
    20000,
  );

  test(
    "getEurobond returns specific bond by ISIN",
    resilientTest(async () => {
      const bonds = await provider.getEurobonds();

      if (bonds.length > 0) {
        const targetIsin = bonds[0].isin;
        const bond = await provider.getEurobond(targetIsin);
        expect(bond).not.toBeNull();
        expect(bond!.isin).toBe(targetIsin);
      }
    }, 1),
    15000,
  );

  test(
    "getEurobond returns null for unknown ISIN",
    resilientTest(async () => {
      const bond = await provider.getEurobond("NONEXISTENT123");
      expect(bond).toBeNull();
    }, 1),
    15000,
  );

  test(
    "getEurobond handles case-insensitive ISIN",
    resilientTest(async () => {
      const bonds = await provider.getEurobonds();

      if (bonds.length > 0) {
        const targetIsin = bonds[0].isin.toLowerCase();
        const bond = await provider.getEurobond(targetIsin);
        expect(bond).not.toBeNull();
      }
    }, 1),
    15000,
  );
});
