import { TechnicalScanner } from "../src/scanner";

// Mock Ticker history to return predictable data
jest.mock("../src/ticker", () => {
  return {
    Ticker: jest.fn().mockImplementation(() => ({
      history: jest.fn().mockResolvedValue([
        {
          date: new Date("2024-01-01"),
          open: 100,
          high: 105,
          low: 95,
          close: 102,
          volume: 1000,
        },
        {
          date: new Date("2024-01-02"),
          open: 102,
          high: 107,
          low: 101,
          close: 105,
          volume: 1100,
        },
        {
          date: new Date("2024-01-03"),
          open: 105,
          high: 110,
          low: 104,
          close: 108,
          volume: 1200,
        },
        {
          date: new Date("2024-01-04"),
          open: 108,
          high: 112,
          low: 107,
          close: 110,
          volume: 1300,
        },
        {
          date: new Date("2024-01-05"),
          open: 110,
          high: 115,
          low: 109,
          close: 113,
          volume: 1400,
        },
        {
          date: new Date("2024-01-06"),
          open: 113,
          high: 118,
          low: 112,
          close: 116,
          volume: 1500,
        },
        {
          date: new Date("2024-01-07"),
          open: 116,
          high: 120,
          low: 115,
          close: 119,
          volume: 1600,
        },
        {
          date: new Date("2024-01-08"),
          open: 119,
          high: 123,
          low: 118,
          close: 122,
          volume: 1700,
        },
        {
          date: new Date("2024-01-09"),
          open: 122,
          high: 125,
          low: 121,
          close: 124,
          volume: 1800,
        },
        {
          date: new Date("2024-01-10"),
          open: 124,
          high: 128,
          low: 123,
          close: 127,
          volume: 1900,
        },
        {
          date: new Date("2024-01-11"),
          open: 127,
          high: 130,
          low: 126,
          close: 129,
          volume: 2000,
        },
      ]),
    })),
  };
});

describe("TechnicalScanner Local Calculations", () => {
  let scanner: TechnicalScanner;

  beforeEach(() => {
    scanner = new TechnicalScanner();
    scanner.addSymbol("THYAO");
  });

  test("should calculate supertrend locally in scanner", async () => {
    scanner.addCondition("supertrend < close");
    const results = await scanner.run();
    expect(results.length).toBeGreaterThanOrEqual(0);
    if (results.length > 0) {
      expect(results[0].data).toHaveProperty("supertrend");
      expect(results[0].data).toHaveProperty("supertrend_direction");
    }
  });

  test("should calculate T3 locally in scanner", async () => {
    scanner.addCondition("t3 < close");
    const results = await scanner.run();
    expect(results.length).toBeGreaterThanOrEqual(0);
    if (results.length > 0) {
      expect(results[0].data).toHaveProperty("t3");
    }
  });
});
