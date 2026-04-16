import { BistIndexProvider } from "~/providers/bist-index";
import { resilientTest } from "../helpers/network-utils";

describe("BistIndexProvider", () => {
  let provider: BistIndexProvider;

  beforeAll(() => {
    provider = new BistIndexProvider();
  });

  describe("getAvailableIndices", () => {
    it(
      "should fetch available indices",
      resilientTest(async () => {
        const indices = await provider.getAvailableIndices();

        expect(indices).toBeDefined();
        expect(Array.isArray(indices)).toBe(true);
        expect(indices.length).toBeGreaterThan(0);

        // Check structure
        if (indices.length > 0) {
          expect(indices[0]).toHaveProperty("symbol");
          expect(indices[0]).toHaveProperty("name");
          expect(indices[0]).toHaveProperty("count");
          expect(typeof indices[0].symbol).toBe("string");
          expect(typeof indices[0].count).toBe("number");
        }

        // Should be sorted by symbol
        const symbols = indices.map((idx) => idx.symbol);
        expect(symbols).toEqual([...symbols].sort());
      }),
      120000,
    );
  });

  describe("getComponents", () => {
    it(
      "should fetch components for XU100",
      resilientTest(async () => {
        const components = await provider.getComponents("XU100");

        expect(components).toBeDefined();
        expect(Array.isArray(components)).toBe(true);
        expect(components.length).toBeGreaterThan(50); // XU100 should have ~100 stocks

        // Check structure
        if (components.length > 0) {
          expect(components[0]).toHaveProperty("symbol");
          expect(components[0]).toHaveProperty("name");
          expect(typeof components[0].symbol).toBe("string");
        }
      }),
      120000,
    );

    it(
      "should fetch components for XU030",
      resilientTest(async () => {
        const components = await provider.getComponents("XU030");

        expect(components).toBeDefined();
        expect(Array.isArray(components)).toBe(true);
        expect(components.length).toBeGreaterThan(20); // XU030 should have ~30 stocks
      }),
      120000,
    );

    it(
      "should return empty array for non-existent index",
      resilientTest(async () => {
        const components = await provider.getComponents("NONEXISTENT");

        expect(components).toBeDefined();
        expect(Array.isArray(components)).toBe(true);
        expect(components.length).toBe(0);
      }),
      120000,
    );
  });

  describe("isInIndex", () => {
    it(
      "should return true for THYAO in XU100",
      resilientTest(async () => {
        const result = await provider.isInIndex("THYAO", "XU100");
        expect(result).toBe(true);
      }),
      120000,
    );

    it(
      "should return false for invalid combination",
      resilientTest(async () => {
        const result = await provider.isInIndex("NONEXISTENT", "XU100");
        expect(result).toBe(false);
      }),
      120000,
    );
  });

  describe("getIndicesForTicker", () => {
    it(
      "should fetch indices for THYAO",
      resilientTest(async () => {
        const indices = await provider.getIndicesForTicker("THYAO");

        expect(indices).toBeDefined();
        expect(Array.isArray(indices)).toBe(true);
        expect(indices.length).toBeGreaterThan(0);

        // THYAO should be in XU100
        expect(indices).toContain("XU100");

        // Should be sorted
        expect(indices).toEqual([...indices].sort());
      }),
      120000,
    );

    it(
      "should return empty array for non-existent ticker",
      resilientTest(async () => {
        const indices = await provider.getIndicesForTicker("NONEXISTENT123");

        expect(indices).toBeDefined();
        expect(Array.isArray(indices)).toBe(true);
        expect(indices.length).toBe(0);
      }),
      120000,
    );
  });
});
