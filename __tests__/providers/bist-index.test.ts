import { DataNotAvailableError } from "@/exceptions";
import { BistIndexProvider } from "@/providers/bist-index";

describe("BistIndexProvider", () => {
  let provider: BistIndexProvider;

  beforeAll(() => {
    provider = new BistIndexProvider();
  });

  // Helper to handle network timeouts gracefully
  const handleTimeout = (e: unknown) => {
    if (
      e instanceof Error &&
      (e.message.includes("timeout") || e.message.includes("Timeout"))
    ) {
      console.warn("Skipping test due to network timeout");
      return true;
    }
    if (e instanceof DataNotAvailableError && e.message.includes("timeout")) {
      console.warn("Skipping test due to network timeout");
      return true;
    }
    return false;
  };

  describe("getAvailableIndices", () => {
    it("should fetch available indices", async () => {
      try {
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
      } catch (e) {
        if (!handleTimeout(e)) throw e;
      }
    }, 45000);
  });

  describe("getComponents", () => {
    it("should fetch components for XU100", async () => {
      try {
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
      } catch (e) {
        if (!handleTimeout(e)) throw e;
      }
    }, 45000);

    it("should fetch components for XU030", async () => {
      try {
        const components = await provider.getComponents("XU030");

        expect(components).toBeDefined();
        expect(Array.isArray(components)).toBe(true);
        expect(components.length).toBeGreaterThan(20); // XU030 should have ~30 stocks
      } catch (e) {
        if (!handleTimeout(e)) throw e;
      }
    }, 45000);

    it("should return empty array for non-existent index", async () => {
      try {
        const components = await provider.getComponents("NONEXISTENT");

        expect(components).toBeDefined();
        expect(Array.isArray(components)).toBe(true);
        expect(components.length).toBe(0);
      } catch (e) {
        if (!handleTimeout(e)) throw e;
      }
    }, 45000);
  });

  describe("isInIndex", () => {
    it("should return true for THYAO in XU100", async () => {
      try {
        const result = await provider.isInIndex("THYAO", "XU100");
        expect(result).toBe(true);
      } catch (e) {
        if (!handleTimeout(e)) throw e;
      }
    }, 45000);

    it("should return false for invalid combination", async () => {
      try {
        const result = await provider.isInIndex("NONEXISTENT", "XU100");
        expect(result).toBe(false);
      } catch (e) {
        if (!handleTimeout(e)) throw e;
      }
    }, 45000);
  });

  describe("getIndicesForTicker", () => {
    it("should fetch indices for THYAO", async () => {
      try {
        const indices = await provider.getIndicesForTicker("THYAO");

        expect(indices).toBeDefined();
        expect(Array.isArray(indices)).toBe(true);
        expect(indices.length).toBeGreaterThan(0);

        // THYAO should be in XU100
        expect(indices).toContain("XU100");

        // Should be sorted
        expect(indices).toEqual([...indices].sort());
      } catch (e) {
        if (!handleTimeout(e)) throw e;
      }
    }, 45000);

    it("should return empty array for non-existent ticker", async () => {
      try {
        const indices = await provider.getIndicesForTicker("NONEXISTENT123");

        expect(indices).toBeDefined();
        expect(Array.isArray(indices)).toBe(true);
        expect(indices.length).toBe(0);
      } catch (e) {
        if (!handleTimeout(e)) throw e;
      }
    }, 45000);
  });
});
