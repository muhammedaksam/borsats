import { getVIOPProvider } from "~/providers/viop";
import { resilientTest } from "../helpers/network-utils";

describe("VIOPProvider", () => {
  const provider = getVIOPProvider();

  jest.setTimeout(30000);

  describe("getFutures", () => {
    it(
      "should fetch all futures contracts",
      resilientTest(async () => {
        const futures = await provider.getFutures("all");

        expect(Array.isArray(futures)).toBe(true);
        // Should have some contracts (could be 0 if market closed)
        if (futures.length > 0) {
          expect(futures[0]).toHaveProperty("code");
          expect(futures[0]).toHaveProperty("contract");
          expect(futures[0]).toHaveProperty("category");
        }
      }),
    );

    it(
      "should filter stock futures",
      resilientTest(async () => {
        const futures = await provider.getFutures("stock");

        expect(Array.isArray(futures)).toBe(true);
        futures.forEach((f) => {
          expect(f.category).toBe("stock");
        });
      }),
    );

    it(
      "should filter index futures",
      resilientTest(async () => {
        const futures = await provider.getFutures("index");

        expect(Array.isArray(futures)).toBe(true);
        futures.forEach((f) => {
          expect(f.category).toBe("index");
        });
      }),
    );
  });

  describe("getOptions", () => {
    it(
      "should fetch all options contracts",
      resilientTest(async () => {
        const options = await provider.getOptions("all");

        expect(Array.isArray(options)).toBe(true);
        if (options.length > 0) {
          expect(options[0]).toHaveProperty("code");
          expect(options[0]).toHaveProperty("contract");
          expect(options[0]).toHaveProperty("category");
        }
      }),
    );
  });

  describe("getAll", () => {
    it(
      "should fetch all VIOP data",
      resilientTest(async () => {
        const data = await provider.getAll();

        expect(data).toHaveProperty("futures");
        expect(data).toHaveProperty("options");
        expect(Array.isArray(data.futures)).toBe(true);
        expect(Array.isArray(data.options)).toBe(true);
      }),
    );
  });
});
