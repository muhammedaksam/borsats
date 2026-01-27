import { getISINProvider } from "@/providers/isin";

describe("ISINProvider", () => {
  const provider = getISINProvider();

  jest.setTimeout(30000);

  describe("getISIN", () => {
    it("should fetch ISIN for THYAO", async () => {
      const isin = await provider.getISIN("THYAO");

      expect(isin).toBeDefined();
      if (isin) {
        expect(isin).toMatch(/^TR[A-Z0-9]{10}$/); // Turkish ISIN format
        expect(isin.length).toBe(12);
      }
    });

    it("should fetch ISIN for GARAN", async () => {
      const isin = await provider.getISIN("GARAN");

      expect(isin).toBeDefined();
      if (isin) {
        expect(isin).toMatch(/^TR[A-Z0-9]{10}$/);
      }
    });

    it("should handle .IS suffix", async () => {
      const isin = await provider.getISIN("THYAO.IS");

      expect(isin).toBeDefined();
      if (isin) {
        expect(isin).toMatch(/^TR/);
      }
    });

    it("should return null for non-existent symbol", async () => {
      const isin = await provider.getISIN("NONEXISTENT999");

      expect(isin).toBeNull();
    });

    it("should use cache on second call", async () => {
      const isin1 = await provider.getISIN("THYAO");
      const startTime = Date.now();
      const isin2 = await provider.getISIN("THYAO");
      const duration = Date.now() - startTime;

      expect(isin1).toEqual(isin2);
      // Cached call should be very fast (<100ms)
      expect(duration).toBeLessThan(100);
    });
  });
});
