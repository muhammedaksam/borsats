import { getTradingViewETFProvider } from "~/providers/tradingview-etf";

// Mock ETF Provider
class MockETFProvider
  extends Object.getPrototypeOf(getTradingViewETFProvider()).constructor
{
  public mockData: unknown = null;
  constructor() {
    super();
    this.client = {
      post: async () => ({ data: this.mockData }),
    } as unknown;
  }
}

describe("TradingView ETF", () => {
  test("TradingView ETF - Mapping Coverage", async () => {
    const provider = new MockETFProvider();
    provider.mockData = {
      data: [
        {
          d: [
            "ETF1",
            "NYSE",
            "ETF Name",
            1000000,
            5.5, // mcap, weight
            "Issuer",
            "Manager",
            "Focus",
            0.5,
            2000000, // expense, aum
            100,
            2.5, // close, change
          ],
        },
      ],
    };

    const res = await provider.getETFHolders("AAPL");
    expect(res[0].symbol).toBe("ETF1");
    expect(res[0].market_cap_usd).toBe(1000000);
    expect(res[0].holding_weight_pct).toBe(5.5);
  });
});
