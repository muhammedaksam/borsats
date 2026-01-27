import { getScannerProvider } from "~/providers/tradingview-scanner";

// Mock Scanner Provider to inject data
class MockScannerProvider
  extends Object.getPrototypeOf(getScannerProvider()).constructor
{
  public mockData: unknown = null;

  constructor() {
    super();
    this.client = {
      post: async () => ({ data: this.mockData }),
    } as unknown;
  }
}

describe("TradingView Scanner", () => {
  jest.setTimeout(30000);

  test("TradingView Scanner - Signal Logic Coverage", async () => {
    const provider = new MockScannerProvider();

    // Construct a data array where we control values
    // OSCILLATOR_COLUMNS has 33 items
    // MOVING_AVERAGE_COLUMNS has 21 items
    // Total 54 items.
    const d = new Array(54).fill(0);

    // RSI is index 0
    d[0] = 25; // BUY
    // Stoch.K is 2, Stoch.D is 3
    d[2] = 10;
    d[3] = 5; // BUY
    // CCI20 is 6
    d[6] = -120; // BUY
    // ADX is 8, +DI 9, -DI 10
    d[8] = 25;
    d[9] = 30;
    d[10] = 20; // BUY
    // AO is 13, AO[1] 14
    d[13] = 1;
    d[14] = 0.5; // BUY
    // Mom is 16, Mom[1] 17
    d[16] = 5;
    d[17] = 4; // BUY
    // MACD.macd 18, signal 19
    d[18] = 2;
    d[19] = 1; // BUY

    // Some Recs (indices 20-32)
    d[20] = 0.6; // Rec.Stoch.RSI

    // MAs start around index 33
    // EMA5 (33), SMA5 (34)... close is last (53)
    d[53] = 100; // Close
    d[33] = 90; // EMA5 (Close > EMA -> BUY)

    provider.mockData = { data: [{ s: "THYAO", d }] };
    const res = await provider.getTASignals("THYAO");
    expect(res.oscillators.compute["RSI"]).toBe("BUY");

    // Now test SELL scenario
    d[0] = 75; // SELL
    d[2] = 90;
    d[3] = 95; // SELL (K > 80 & K < D)
    d[6] = 150; // SELL
    d[8] = 25;
    d[9] = 20;
    d[10] = 30; // SELL (+ < -)
    d[13] = -1;
    d[14] = -0.5; // SELL
    d[16] = -5;
    d[17] = -4; // SELL (logic is Mom < MomPrev) wait: -5 < -4 is true
    d[18] = 1;
    d[19] = 2; // SELL
    d[53] = 80;
    d[33] = 90; // Close < EMA -> SELL

    // Use new symbol to avoid cached result
    provider.mockData = { data: [{ s: "THYAO2", d }] };
    const res2 = await provider.getTASignals("THYAO2");
    expect(res2.oscillators.compute["RSI"]).toBe("SELL");

    // Now test NEUTRAL scenario
    d[0] = 50;
    d[2] = 50;
    d[3] = 50;
    d[6] = 0;
    d[8] = 10; // ADX < 20 -> Neutral
    d[13] = 0;
    d[14] = null; // Neutral
    d[16] = 0;
    d[17] = null;

    provider.mockData = { data: [{ s: "THYAO", d }] };
    await provider.getTASignals("THYAO");
  });
});
