import {
  calculatePercentChange,
  cleanSymbol,
  formatDate,
  getStartDateForPeriod,
  isBrowser,
  isNode,
  parseDate,
  roundTo,
  SimpleCache,
} from "@/utils/helpers";

describe("Helpers", () => {
  test("parseDate", () => {
    const d = new Date();
    expect(parseDate(d)).toBe(d);
    expect(parseDate("2023-01-01")).toBeInstanceOf(Date);
  });

  test("formatDate", () => {
    const d = new Date(2023, 0, 1);
    expect(formatDate(d)).toBe("2023-01-01");
  });

  test("getStartDateForPeriod", () => {
    const year = new Date().getFullYear();
    const end = new Date(year, 5, 1);

    // YTD branch
    const ytd = getStartDateForPeriod("ytd");
    expect(ytd.getFullYear()).toBe(year);
    expect(ytd.getMonth()).toBe(0);
    expect(ytd.getDate()).toBe(1);

    // Max branch (old date)
    const max = getStartDateForPeriod("max", end);
    expect(max.getFullYear()).toBe(1990);

    // Regular branch (e.g. 1mo)
    const mo = getStartDateForPeriod("1mo", end);
    expect(mo.getTime()).toBeLessThan(end.getTime());

    // 5d branch
    const d5 = getStartDateForPeriod("5d", end);
    expect(d5.getTime()).toBeLessThan(end.getTime());
  });

  test("cleanSymbol", () => {
    expect(cleanSymbol("THYAO.IS")).toBe("THYAO");
    expect(cleanSymbol("thyao.e")).toBe("THYAO");
    expect(cleanSymbol("SISE")).toBe("SISE");
  });

  test("isBrowser and isNode basic", () => {
    expect(typeof isNode()).toBe("boolean");
    expect(typeof isBrowser()).toBe("boolean");
  });

  test("SimpleCache", async () => {
    const cache = new SimpleCache<string>();
    cache.set("foo", "bar", 1); // 1 second TTL
    expect(cache.get("foo")).toBe("bar");
    expect(cache.has("foo")).toBe(true);

    // Test expiry branch in get()
    await new Promise((r) => setTimeout(r, 1100));
    expect(cache.get("foo")).toBeUndefined();
    expect(cache.has("foo")).toBe(false);

    cache.set("a", "b");
    cache.delete("a");
    expect(cache.has("a")).toBe(false);

    cache.set("x", "y");
    cache.clear();
    expect(cache.has("x")).toBe(false);
  });

  test("calculatePercentChange", () => {
    expect(calculatePercentChange(110, 100)).toBe(10);
    expect(calculatePercentChange(100, 0)).toBe(0); // Branch for zero previous
  });

  test("roundTo", () => {
    expect(roundTo(1.2345, 3)).toBe(1.235);
    expect(roundTo(1.235)).toBe(1.24);
  });
});
