// Mocked tests for providers: base.ts, tradingview-screener-native.ts, hedeffiyat.ts

import axios from "axios";
import { BaseProvider } from "~/providers/base";
import { APIError, RateLimitError } from "~/exceptions";
import { TVScreenerProvider, getTVScreenerProvider } from "~/providers/tradingview-screener-native";
import { HedefFiyatProvider } from "~/providers/hedeffiyat";

// Concrete subclass for testing BaseProvider
class TestProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
  }
  async testRequest<T>(url: string, options = {}): Promise<T> {
    return this.request<T>(url, options);
  }
}

describe("BaseProvider Coverage", () => {
  test("clearCache clears the cache", () => {
    const p = new TestProvider();
    p.clearCache();
    // Should not throw
  });

  test("request caches GET responses", async () => {
    const p = new TestProvider({ cache: { enabled: true, ttl: 60 } });
    jest.spyOn(p["client"], "request").mockResolvedValueOnce({ data: { ok: true } });
    const r1 = await p.testRequest("/test");
    const r2 = await p.testRequest("/test");
    expect(r1).toEqual(r2);
    expect(p["client"].request).toHaveBeenCalledTimes(1);
  });

  test("request does not cache POST", async () => {
    const p = new TestProvider({ cache: { enabled: true, ttl: 60 } });
    jest.spyOn(p["client"], "request").mockResolvedValue({ data: { ok: true } });
    await p.testRequest("/test", { method: "POST" });
    await p.testRequest("/test", { method: "POST" });
    expect(p["client"].request).toHaveBeenCalledTimes(2);
  });

  test("request throws APIError on 4xx (non-429)", async () => {
    const p = new TestProvider({ maxRetries: 0 });
    const axiosError = new Error("Not Found") as any;
    axiosError.isAxiosError = true;
    axiosError.response = { status: 404, data: "Not found" };
    jest.spyOn(axios, "isAxiosError").mockReturnValue(true);
    jest.spyOn(p["client"], "request").mockRejectedValue(axiosError);
    await expect(p.testRequest("/test")).rejects.toThrow(APIError);
  });

  test("request retries on 5xx errors", async () => {
    const p = new TestProvider({ maxRetries: 1 });
    const axiosError = new Error("Server Error") as any;
    axiosError.isAxiosError = true;
    axiosError.response = { status: 500 };
    jest.spyOn(axios, "isAxiosError").mockReturnValue(true);
    const spy = jest.spyOn(p["client"], "request");
    spy.mockRejectedValueOnce(axiosError);
    spy.mockResolvedValueOnce({ data: "ok" });
    const r = await p.testRequest("/test");
    expect(r).toBe("ok");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test("request handles 429 rate limit", async () => {
    const p = new TestProvider({ maxRetries: 1 });
    const axiosError = new Error("Rate Limited") as any;
    axiosError.isAxiosError = true;
    axiosError.response = { status: 429, headers: { "retry-after": "0" } };
    jest.spyOn(axios, "isAxiosError").mockReturnValue(true);
    const spy = jest.spyOn(p["client"], "request");
    spy.mockRejectedValueOnce(axiosError);
    spy.mockResolvedValueOnce({ data: "ok" });
    const r = await p.testRequest("/test");
    expect(r).toBe("ok");
  });

  test("request throws RateLimitError on 429 at max retries", async () => {
    const p = new TestProvider({ maxRetries: 0 });
    const axiosError = new Error("Rate Limited") as any;
    axiosError.isAxiosError = true;
    axiosError.response = { status: 429, headers: { "retry-after": "0" } };
    jest.spyOn(axios, "isAxiosError").mockReturnValue(true);
    jest.spyOn(p["client"], "request").mockRejectedValue(axiosError);
    await expect(p.testRequest("/test")).rejects.toThrow(RateLimitError);
  });

  test("request throws APIError on non-axios error after retries", async () => {
    const p = new TestProvider({ maxRetries: 0 });
    jest.spyOn(axios, "isAxiosError").mockReturnValue(false);
    jest.spyOn(p["client"], "request").mockRejectedValue(new Error("Unknown"));
    await expect(p.testRequest("/test")).rejects.toThrow(APIError);
  });
});

describe("TVScreenerProvider Coverage", () => {
  const screener = getTVScreenerProvider();

  test("extractFields parses condition tokens", () => {
    const fields = screener.extractFields("close > sma_50 and rsi < 30");
    expect(fields).toContain("close");
    expect(fields).toContain("sma_50");
    expect(fields).toContain("rsi");
  });

  test("getSelectColumns includes default and condition columns", () => {
    const cols = screener.getSelectColumns(["close > 100"], undefined, "1d");
    expect(cols).toContain("name");
    expect(cols).toContain("close");
  });

  test("getSelectColumns includes extra columns", () => {
    const cols = screener.getSelectColumns([], ["rsi", "volume"], "1d");
    expect(cols).toContain("RSI");
    expect(cols).toContain("volume");
  });

  test("scan with mixed API and local conditions", async () => {
    // Mock the request method
    jest.spyOn(screener as any, "request").mockResolvedValue({
      data: [{ s: "BIST:THYAO", d: ["THYAO", 100, 2, 500000, 1000000] }],
    });
    const results = await screener.scan({
      symbols: ["THYAO"],
      conditions: ["close > 0", "supertrend > 0"],
      interval: "1d",
    });
    expect(Array.isArray(results)).toBe(true);
  });

  test("scanAPI processes results correctly", async () => {
    jest.spyOn(screener as any, "request").mockResolvedValue({
      data: [
        { s: "BIST:THYAO", d: ["THYAO", 100, 2, 500000, 1000000] },
        { s: "BIST:OTHER", d: ["OTHER", 50, 1, 200000, 500000] },
      ],
    });
    const results = await screener.scan({
      symbols: ["THYAO"],
      conditions: ["close > 0"],
      interval: "1d",
    });
    // Should only include THYAO (requested symbol)
    expect(results.every((r) => r.symbol === "THYAO")).toBe(true);
  });

  test("scanAPI with empty filters returns empty", async () => {
    const results = await screener.scan({
      symbols: ["THYAO"],
      conditions: ["invalid condition without operator"],
      interval: "1d",
    });
    expect(results).toEqual([]);
  });

  test("scanAPI handles API error", async () => {
    jest.spyOn(screener as any, "request").mockRejectedValue(new Error("API fail"));
    await expect(
      screener.scan({ symbols: ["THYAO"], conditions: ["close > 0"] }),
    ).rejects.toThrow();
  });

  test("getTVColumn with interval suffix for 1h", () => {
    expect(screener.getTVColumn("rsi", "1h")).toBe("RSI|60");
  });

  test("parseCondition with >= operator", () => {
    const c = screener.parseCondition("volume >= 1M", "1d");
    expect(c).toEqual({ left: "volume", operator: ">=", right: 1000000 });
  });

  test("parseCondition with <= operator", () => {
    const c = screener.parseCondition("rsi <= 30", "1d");
    expect(c).toEqual({ left: "RSI", operator: "<=", right: 30 });
  });

  test("parseCondition with != operator", () => {
    const c = screener.parseCondition("close != 0", "1d");
    expect(c).toEqual({ left: "close", operator: "!=", right: 0 });
  });
});

describe("HedefFiyatProvider Coverage", () => {
  let provider: HedefFiyatProvider;

  beforeEach(() => {
    provider = new HedefFiyatProvider();
  });

  test("_parseNumber with Turkish format (dot+comma)", () => {
    // @ts-expect-error accessing private
    expect(provider._parseNumber("1.234,56")).toBe(1234.56);
  });

  test("_parseNumber with comma only", () => {
    // @ts-expect-error accessing private
    expect(provider._parseNumber("123,45")).toBe(123.45);
  });

  test("_parseNumber with plain number", () => {
    // @ts-expect-error accessing private
    expect(provider._parseNumber("123.45")).toBe(123.45);
  });

  test("_parseNumber with empty string", () => {
    // @ts-expect-error accessing private
    expect(provider._parseNumber("")).toBeNull();
  });

  test("_parsePriceTargets extracts data from HTML", () => {
    const html = `
      <div>Güncel Fiyat</div><strong>123,45 ₺</strong>
      <div>En Yüksek Tahmin</div><div>200,00 ₺</div>
      <div>En Düşük Tahmin</div><div>100,00 ₺</div>
      <div>Ortalama Fiyat Tahmini</div><div>150,00 ₺</div>
      <div>Kurum Sayısı</div><strong>5</strong>
    `;
    // @ts-expect-error accessing private
    const result = provider._parsePriceTargets(html);
    expect(result.current).toBe(123.45);
    expect(result.high).toBe(200);
    expect(result.low).toBe(100);
    expect(result.mean).toBe(150);
    expect(result.numberOfAnalysts).toBe(5);
    expect(result.median).toBe(150); // (100+200)/2
  });

  test("_parsePriceTargets with empty HTML returns nulls", () => {
    // @ts-expect-error accessing private
    const result = provider._parsePriceTargets("");
    expect(result.current).toBeNull();
    expect(result.median).toBeNull();
  });

  test("getPriceTargets returns default on error", async () => {
    jest.spyOn(provider["client"], "get").mockRejectedValue(new Error("fail"));
    const result = await provider.getPriceTargets("THYAO");
    expect(result.current).toBeNull();
  });

  test("getRecommendationsSummary returns default on error", async () => {
    jest.spyOn(provider["client"], "get").mockRejectedValue(new Error("fail"));
    const result = await provider.getRecommendationsSummary("THYAO");
    expect(result.strongBuy).toBe(0);
  });

  test("getRecommendationsSummary parses buttons", async () => {
    const html = `
      <a class="btn-sm btn-success">Güçlü Al</a>
      <a class="btn-sm btn-success">Al</a>
      <a class="btn-sm btn-warning">Tut</a>
      <a class="btn-sm btn-danger">Sat</a>
      <a class="btn-sm btn-danger">Güçlü Sat</a>
      <a class="btn-sm btn-success">Endeks Üstü</a>
      <a class="btn-sm btn-warning">Nötr</a>
      <a class="btn-sm btn-warning">Endekse Paralel</a>
      <a class="btn-sm btn-danger">Endeks Altı</a>
    `;
    // Mock _getStockUrl to return a URL
    jest.spyOn(provider as any, "_getStockUrl").mockResolvedValue("https://test.com/senet/thyao");
    jest.spyOn(provider["client"], "get").mockResolvedValue({ data: html });
    const result = await provider.getRecommendationsSummary("THYAO");
    expect(result.strongBuy).toBeGreaterThanOrEqual(1);
    expect(result.buy).toBeGreaterThanOrEqual(1);
    expect(result.hold).toBeGreaterThanOrEqual(1);
    expect(result.sell).toBeGreaterThanOrEqual(1);
    expect(result.strongSell).toBeGreaterThanOrEqual(1);
  });

  test("_getStockUrl caches result", async () => {
    // @ts-expect-error accessing private
    provider.urlCache.set("THYAO", "https://test.com/senet/thyao");
    // @ts-expect-error accessing private
    const url = await provider._getStockUrl("THYAO");
    expect(url).toBe("https://test.com/senet/thyao");
  });

  test("_searchStockUrl returns null on error", async () => {
    jest.spyOn(provider["client"], "get").mockRejectedValue(new Error("fail"));
    // @ts-expect-error accessing private
    const url = await provider._searchStockUrl("THYAO");
    expect(url).toBeNull();
  });

  test("_searchStockUrl extracts URL from HTML", async () => {
    jest.spyOn(provider["client"], "get").mockResolvedValue({
      data: '<a href="/senet/thyao-hisse-senedi">THYAO</a>',
    });
    // @ts-expect-error accessing private
    const url = await provider._searchStockUrl("THYAO");
    expect(url).toContain("thyao");
  });

  test("_getStockUrl falls back to search", async () => {
    jest.spyOn(provider["client"], "get")
      .mockResolvedValueOnce({ data: "<html>no match</html>" }) // senetler page
      .mockResolvedValueOnce({ data: '<a href="/senet/thyao-hisse">THYAO</a>' }); // search
    // @ts-expect-error accessing private
    const url = await provider._getStockUrl("THYAO");
    expect(url).toContain("thyao");
  });

  test("_getStockUrl returns null on complete failure", async () => {
    jest.spyOn(provider["client"], "get").mockRejectedValue(new Error("fail"));
    // @ts-expect-error accessing private
    const url = await provider._getStockUrl("THYAO");
    expect(url).toBeNull();
  });

  test("getPriceTargets with valid page caches result", async () => {
    const html = `
      <div>Güncel Fiyat</div><strong>50,00 ₺</strong>
      <div>Kurum Sayısı</div><strong>3</strong>
    `;
    jest.spyOn(provider as any, "_getStockUrl").mockResolvedValue("https://test.com/senet/thyao");
    jest.spyOn(provider["client"], "get").mockResolvedValue({ data: html });
    const r = await provider.getPriceTargets("THYAO");
    expect(r.current).toBe(50);
    expect(r.numberOfAnalysts).toBe(3);
  });

  test("getPriceTargets returns default when no URL found", async () => {
    jest.spyOn(provider as any, "_getStockUrl").mockResolvedValue(null);
    const r = await provider.getPriceTargets("NONEXIST");
    expect(r.current).toBeNull();
  });

  test("getPriceTargets returns default when empty HTML", async () => {
    jest.spyOn(provider as any, "_getStockUrl").mockResolvedValue("https://test.com/x");
    jest.spyOn(provider["client"], "get").mockResolvedValue({ data: "" });
    const r = await provider.getPriceTargets("THYAO");
    expect(r.current).toBeNull();
  });

  test("getRecommendationsSummary with no URL returns default", async () => {
    jest.spyOn(provider as any, "_getStockUrl").mockResolvedValue(null);
    const r = await provider.getRecommendationsSummary("NONE");
    expect(r.strongBuy).toBe(0);
  });

  test("getRecommendationsSummary with empty HTML returns default", async () => {
    jest.spyOn(provider as any, "_getStockUrl").mockResolvedValue("https://test.com/x");
    jest.spyOn(provider["client"], "get").mockResolvedValue({ data: "" });
    const r = await provider.getRecommendationsSummary("THYAO");
    expect(r.strongBuy).toBe(0);
  });

  test("getRecommendationsSummary fallback to button color", async () => {
    const html = `
      <a class="btn-sm btn-success">Unknown Text</a>
      <a class="btn-sm btn-warning">Other Text</a>
      <a class="btn-sm btn-primary">Primary Text</a>
      <a class="btn-sm btn-danger">Danger Text</a>
    `;
    jest.spyOn(provider as any, "_getStockUrl").mockResolvedValue("https://test.com/senet/thyao");
    jest.spyOn(provider["client"], "get").mockResolvedValue({ data: html });
    const r = await provider.getRecommendationsSummary("THYAO");
    expect(r.buy).toBeGreaterThanOrEqual(1);
    expect(r.hold).toBeGreaterThanOrEqual(1);
    expect(r.sell).toBeGreaterThanOrEqual(1);
  });
});
