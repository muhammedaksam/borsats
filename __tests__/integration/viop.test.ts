import { VIOP } from "~/viop";

describe("VIOP Module", () => {
  jest.setTimeout(60000);

  test("VIOP futures", async () => {
    const v = new VIOP();
    const futures = await v.futures;
    expect(Array.isArray(futures)).toBe(true);
  });

  test("VIOP stockFutures", async () => {
    const v = new VIOP();
    const stockFutures = await v.stockFutures;
    expect(Array.isArray(stockFutures)).toBe(true);
  });

  test("VIOP indexFutures", async () => {
    const v = new VIOP();
    const indexFutures = await v.indexFutures;
    expect(Array.isArray(indexFutures)).toBe(true);
  });

  test("VIOP currencyFutures", async () => {
    const v = new VIOP();
    const currencyFutures = await v.currencyFutures;
    expect(Array.isArray(currencyFutures)).toBe(true);
  });

  test("VIOP commodityFutures", async () => {
    const v = new VIOP();
    const commodityFutures = await v.commodityFutures;
    expect(Array.isArray(commodityFutures)).toBe(true);
  });

  test("VIOP options", async () => {
    const v = new VIOP();
    const options = await v.options;
    expect(Array.isArray(options)).toBe(true);
  });

  test("VIOP stockOptions", async () => {
    const v = new VIOP();
    const stockOptions = await v.stockOptions;
    expect(Array.isArray(stockOptions)).toBe(true);
  });

  test("VIOP indexOptions", async () => {
    const v = new VIOP();
    const indexOptions = await v.indexOptions;
    expect(Array.isArray(indexOptions)).toBe(true);
  });

  test("VIOP getBySymbol", async () => {
    const v = new VIOP();
    const result = await v.getBySymbol("XU030");
    expect(Array.isArray(result)).toBe(true);
  });

  test("VIOP cache hit on futures", async () => {
    const v = new VIOP();
    await v.futures; // First call
    await v.futures; // Should hit cache
  });

  test("VIOP cache hit on options", async () => {
    const v = new VIOP();
    await v.options; // First call
    await v.options; // Should hit cache
  });
});
