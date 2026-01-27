import { DataNotAvailableError } from "@/exceptions";
import { getTahvilProvider } from "@/providers/dovizcom-tahvil";

describe("DovizcomTahvilProvider", () => {
  const provider = getTahvilProvider();

  jest.setTimeout(15000);

  describe("getBondYields", () => {
    it("should fetch all bond yields", async () => {
      const bonds = await provider.getBondYields();

      expect(Array.isArray(bonds)).toBe(true);
      expect(bonds.length).toBeGreaterThan(0);

      const bond = bonds[0];
      expect(bond).toHaveProperty("name");
      expect(bond).toHaveProperty("yield");
      expect(typeof bond.name).toBe("string");
    });

    it("should include yield and change data", async () => {
      const bonds = await provider.getBondYields();

      const bondWithYield = bonds.find((b) => b.yield !== null);
      if (bondWithYield) {
        expect(typeof bondWithYield.yield).toBe("number");
        expect(bondWithYield.yieldDecimal).toBeTruthy();
        expect(bondWithYield.yieldDecimal).toBe(bondWithYield.yield! / 100);
      }
    });
  });

  describe("getBond", () => {
    it("should fetch 10Y bond", async () => {
      const bond = await provider.getBond("10Y");

      expect(bond).toBeDefined();
      expect(bond.maturity).toBe("10Y");
      expect(bond.name).toContain("10");
    });

    it("should fetch 2Y bond", async () => {
      const bond = await provider.getBond("2Y");

      expect(bond).toBeDefined();
      expect(bond.maturity).toBe("2Y");
    });

    it("should throw error for non-existent maturity", async () => {
      await expect(provider.getBond("99Y")).rejects.toThrow(
        DataNotAvailableError,
      );
    });
  });

  describe("get10YYield", () => {
    it("should fetch 10Y yield as decimal", async () => {
      const yield10Y = await provider.get10YYield();

      expect(yield10Y).toBeDefined();
      expect(typeof yield10Y).toBe("number");
      // Turkish bonds typically have yields between 0.10 (10%) and 0.50 (50%)
      expect(yield10Y!).toBeGreaterThan(0);
      expect(yield10Y!).toBeLessThan(1);
    });
  });
});
