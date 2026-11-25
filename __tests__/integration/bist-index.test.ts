import { allIndices, index, indices } from "~/bist-index";
import { resilientTest } from "../helpers/network-utils";

describe("BIST Index Wrapper", () => {
  test("indices() should return list of index symbols", async () => {
    const list = await indices();
    expect(Array.isArray(list)).toBe(true);
    expect(list).toContain("XU100");
  });

  test(
    "indices(true) should return detailed info",
    resilientTest(async () => {
      const list = await indices(true);
      expect(Array.isArray(list)).toBe(true);
      const xu100 = (
        list as Array<{ symbol: string; name: string; count: number }>
      ).find((i) => i.symbol === "XU100");
      expect(xu100).toBeDefined();
      expect(xu100?.name).toBe("BIST 100");
      expect(typeof xu100?.count).toBe("number");
    }, 1),
  );

  test(
    "allIndices() should return all indices from provider",
    resilientTest(async () => {
      const list = await allIndices();
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
      expect(list[0]).toHaveProperty("symbol");
      expect(list[0]).toHaveProperty("count");
    }, 1),
  );

  describe("Index Class", () => {
    const idx = index("XU100");

    test("should initialize correctly", () => {
      expect(idx.symbol).toBe("XU100");
    });

    test(
      "info should return current quote",
      resilientTest(async () => {
        const info = await idx.info;
        expect(info.symbol).toBe("XU100");
        expect(info.name).toBe("BIST 100");
        expect(typeof info.value).toBe("number");
      }, 1),
    );

    test(
      "history should return OHLCV data",
      resilientTest(async () => {
        const history = await idx.history({ period: "1mo" });
        expect(history.length).toBeGreaterThan(0);
        expect(history[0]).toHaveProperty("close");
      }, 1),
    );

    test(
      "components should return constituent stocks",
      resilientTest(async () => {
        const components = await idx.components;
        expect(Array.isArray(components)).toBe(true);
        expect(components.length).toBeGreaterThan(0);
      }, 1),
    );

    test(
      "componentSymbols should return list of symbols",
      resilientTest(async () => {
        const symbols = await idx.componentSymbols();
        expect(Array.isArray(symbols)).toBe(true);
        expect(symbols.length).toBeGreaterThan(0);
        expect(typeof symbols[0]).toBe("string");
      }, 1),
    );
  });
});
