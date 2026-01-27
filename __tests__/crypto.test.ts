import { Crypto, cryptoList } from "~/crypto";

describe("Crypto", () => {
  const coin = new Crypto("BTCTRY");

  test("should initialize correctly", () => {
    expect(coin.pair).toBe("BTCTRY");
    expect(coin.symbol).toBe("BTCTRY");
  });

  test("should handle lowercase pair", () => {
    const lowerCoin = new Crypto("btctry");
    expect(lowerCoin.pair).toBe("BTCTRY"); // Should be uppercased
  });

  test("current should return ticker data", async () => {
    const data = await coin.current;
    expect(data).toHaveProperty("last");
    expect(typeof data.last).toBe("number");
  });

  test("current should use cache on second call", async () => {
    const data1 = await coin.current;
    const data2 = await coin.current; // Should hit cache
    expect(data1).toBe(data2);
  });

  test("history with default parameters", async () => {
    const history = await coin.history(); // No options - tests default {}
    expect(Array.isArray(history)).toBe(true);
  });

  test("history should return OHLCV data", async () => {
    const history = await coin.history({ interval: "1d" });
    expect(Array.isArray(history)).toBe(true);
    if (history.length > 0) {
      expect(history[0]).toHaveProperty("close");
    }
  });

  test("history with custom interval", async () => {
    const history = await coin.history({ interval: "1h" });
    expect(Array.isArray(history)).toBe(true);
  });

  test("history with start and end dates", async () => {
    const end = new Date();
    const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    const history = await coin.history({ start, end });
    expect(Array.isArray(history)).toBe(true);
  });

  test("history with string dates", async () => {
    const history = await coin.history({
      start: "2024-01-01",
      end: "2024-01-07",
      interval: "1d",
    });
    expect(Array.isArray(history)).toBe(true);
  });

  test("technicals should return analyzer", async () => {
    const ta = await coin.technicals();
    expect(ta).toBeDefined();
  });

  test("technicals with custom interval", async () => {
    const ta = await coin.technicals("1h");
    expect(ta).toBeDefined();
  });

  test("cryptoList should return pairs", async () => {
    const list = await cryptoList();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
  });
});
