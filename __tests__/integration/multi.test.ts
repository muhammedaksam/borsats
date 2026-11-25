import { download, Tickers } from "~/multi";
import { Ticker } from "~/ticker";

describe("Multi Module", () => {
  jest.setTimeout(60000);

  test("Tickers class construction", () => {
    const tickers = new Tickers(["THYAO", "GARAN"]);
    expect(tickers.symbols).toEqual(["THYAO", "GARAN"]);
    expect(tickers.tickers["THYAO"]).toBeInstanceOf(Ticker);
    expect(tickers.tickers["GARAN"]).toBeInstanceOf(Ticker);
  });

  test("download function with default options", async () => {
    const result = await download(["THYAO"], { period: "1w" });
    expect(result).toBeDefined();
    expect(result["THYAO"]).toBeDefined();
    expect(Array.isArray(result["THYAO"])).toBe(true);
  });

  test("download function with groupBy ticker", async () => {
    const result = await download(["GARAN"], {
      period: "1w",
      groupBy: "ticker",
    });
    expect(result["GARAN"]).toBeDefined();
  });

  test("download function with groupBy column", async () => {
    const result = await download(["THYAO"], {
      period: "1w",
      groupBy: "column",
    });
    expect(result).toBeDefined();
  });
});
