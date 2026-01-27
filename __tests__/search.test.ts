import {
  search,
  searchBist,
  searchCrypto,
  searchForex,
  searchIndex,
} from "@/search";

describe("Search Module", () => {
  jest.setTimeout(60000);

  test("search function basic", async () => {
    const results = await search("THYAO");
    expect(Array.isArray(results)).toBe(true);
  });

  test("search with empty query throws", async () => {
    await expect(search("")).rejects.toThrow();
    await expect(search("   ")).rejects.toThrow();
  });

  test("search with type stock", async () => {
    const results = await search("GARAN", { type: "stock" });
    expect(Array.isArray(results)).toBe(true);
  });

  test("search with exchange BIST", async () => {
    const results = await search("AKBNK", { exchange: "BIST" });
    expect(Array.isArray(results)).toBe(true);
  });

  test("search with limit", async () => {
    const results = await search("A", { limit: 5 });
    expect(Array.isArray(results)).toBe(true);
  });

  test("search with fullInfo", async () => {
    const results = await search("THYAO", { fullInfo: true });
    expect(Array.isArray(results)).toBe(true);
    if (results.length > 0) {
      expect(results[0]).toHaveProperty("symbol");
      expect(results[0]).toHaveProperty("exchange");
    }
  });

  test("search crypto type", async () => {
    const results = await search("BTC", { type: "crypto" });
    expect(Array.isArray(results)).toBe(true);
  });

  test("searchBist function", async () => {
    const results = await searchBist("THY");
    expect(Array.isArray(results)).toBe(true);
  });

  test("searchCrypto function", async () => {
    const results = await searchCrypto("ETH");
    expect(Array.isArray(results)).toBe(true);
  });

  test("searchForex function", async () => {
    const results = await searchForex("EUR");
    expect(Array.isArray(results)).toBe(true);
  });

  test("searchIndex function", async () => {
    const results = await searchIndex("XU");
    expect(Array.isArray(results)).toBe(true);
  });
});
