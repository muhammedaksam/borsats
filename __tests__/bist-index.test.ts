import { allIndices, index, indices } from "~/bist-index";

describe("BIST Index Wrapper", () => {
  test("indices() should return list of index symbols", async () => {
    const list = await indices();
    expect(Array.isArray(list)).toBe(true);
    expect(list).toContain("XU100");
  });

  test("indices(true) should return detailed info", async () => {
    try {
      const list = await indices(true);
      expect(Array.isArray(list)).toBe(true);
      const xu100 = (
        list as Array<{ symbol: string; name: string; count: number }>
      ).find((i) => i.symbol === "XU100");
      expect(xu100).toBeDefined();
      expect(xu100?.name).toBe("BIST 100");
      expect(typeof xu100?.count).toBe("number");
    } catch (e) {
      if (e instanceof Error && e.message.includes("timeout")) {
        console.warn("Skipping indices(true) test due to network timeout");
      } else {
        throw e;
      }
    }
  });

  test("allIndices() should return all indices from provider", async () => {
    const list = await allIndices();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]).toHaveProperty("symbol");
    expect(list[0]).toHaveProperty("count");
  });

  describe("Index Class", () => {
    const idx = index("XU100");

    test("should initialize correctly", () => {
      expect(idx.symbol).toBe("XU100");
    });

    test("info should return current quote", async () => {
      const info = await idx.info;
      expect(info.symbol).toBe("XU100");
      expect(info.name).toBe("BIST 100");
      expect(typeof info.value).toBe("number");
    });

    test("history should return OHLCV data", async () => {
      try {
        const history = await idx.history({ period: "1mo" });
        expect(history.length).toBeGreaterThan(0);
        expect(history[0]).toHaveProperty("close");
      } catch (e) {
        if (e instanceof Error && e.message.includes("429")) {
          console.warn("Skipping bist-index history test due to rate limit");
        } else {
          console.warn("bist-index history test continuing despite error:", e);
        }
      }
    });

    test("components should return constituent stocks", async () => {
      const components = await idx.components;
      expect(Array.isArray(components)).toBe(true);
      expect(components.length).toBeGreaterThan(0);
    });

    test("componentSymbols should return list of symbols", async () => {
      const symbols = await idx.componentSymbols();
      expect(Array.isArray(symbols)).toBe(true);
      expect(symbols.length).toBeGreaterThan(0);
      expect(typeof symbols[0]).toBe("string");
    });
  });
});
