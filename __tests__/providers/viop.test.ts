import { APIError } from "@/exceptions";
import { getVIOPProvider } from "@/providers/viop";

describe("VIOPProvider", () => {
  const provider = getVIOPProvider();

  jest.setTimeout(20000);

  describe("getFutures", () => {
    it("should fetch all futures contracts", async () => {
      try {
        const futures = await provider.getFutures("all");

        expect(Array.isArray(futures)).toBe(true);
        // Should have some contracts (could be 0 if market closed)
        if (futures.length > 0) {
          expect(futures[0]).toHaveProperty("code");
          expect(futures[0]).toHaveProperty("contract");
          expect(futures[0]).toHaveProperty("category");
        }
      } catch (e) {
        if (e instanceof APIError) {
          expect(e).toBeInstanceOf(APIError);
        } else {
          throw e;
        }
      }
    });

    it("should filter stock futures", async () => {
      const futures = await provider.getFutures("stock");

      expect(Array.isArray(futures)).toBe(true);
      futures.forEach((f) => {
        expect(f.category).toBe("stock");
      });
    });

    it("should filter index futures", async () => {
      const futures = await provider.getFutures("index");

      expect(Array.isArray(futures)).toBe(true);
      futures.forEach((f) => {
        expect(f.category).toBe("index");
      });
    });
  });

  describe("getOptions", () => {
    it("should fetch all options contracts", async () => {
      const options = await provider.getOptions("all");

      expect(Array.isArray(options)).toBe(true);
      if (options.length > 0) {
        expect(options[0]).toHaveProperty("code");
        expect(options[0]).toHaveProperty("contract");
        expect(options[0]).toHaveProperty("category");
      }
    });
  });

  describe("getAll", () => {
    it("should fetch all VIOP data", async () => {
      const data = await provider.getAll();

      expect(data).toHaveProperty("futures");
      expect(data).toHaveProperty("options");
      expect(Array.isArray(data.futures)).toBe(true);
      expect(Array.isArray(data.options)).toBe(true);
    });
  });
});
