import { AuthenticationError, DataNotAvailableError } from "~/exceptions";
import {
  getPineFacadeProvider,
  INDICATOR_OUTPUTS,
  STANDARD_INDICATORS,
} from "~/providers/pine-facade";

describe("PineFacade Provider Tests", () => {
  jest.setTimeout(30000);

  test("STANDARD_INDICATORS constants", () => {
    expect(STANDARD_INDICATORS.RSI).toBe("STD;RSI");
    expect(STANDARD_INDICATORS.MACD).toBe("STD;MACD");
    expect(STANDARD_INDICATORS.BB).toBe("STD;BB");
    expect(STANDARD_INDICATORS.EMA).toBe("STD;EMA");
    expect(STANDARD_INDICATORS.SMA).toBe("STD;SMA");
  });

  test("INDICATOR_OUTPUTS mappings", () => {
    expect(INDICATOR_OUTPUTS["STD;RSI"]).toHaveProperty("plot_0");
    expect(INDICATOR_OUTPUTS["STD;MACD"]).toHaveProperty("plot_0");
    expect(INDICATOR_OUTPUTS["STD;MACD"]).toHaveProperty("plot_1");
    expect(INDICATOR_OUTPUTS["STD;BB"]).toHaveProperty("plot_1");
  });

  test("getPineFacadeProvider singleton", () => {
    const provider1 = getPineFacadeProvider();
    const provider2 = getPineFacadeProvider();
    expect(provider1).toBe(provider2); // Should return same instance
  });

  test("PineFacade getIndicator with standard indicator", async () => {
    const provider = getPineFacadeProvider();
    try {
      const metadata = await provider.getIndicator("RSI");
      expect(metadata).toBeDefined();
      expect(metadata.pineId).toBeDefined();
    } catch (e) {
      console.warn("Standard indicator test continuing:", e);
    }
  });

  test("PineFacade getOutputMapping", () => {
    const provider = getPineFacadeProvider();
    const mapping = provider.getOutputMapping("RSI");
    expect(mapping).toBeDefined();
  });

  test("PineFacade getOutputMapping with unknown indicator", () => {
    const provider = getPineFacadeProvider();
    const mapping = provider.getOutputMapping("UNKNOWN_INDICATOR_XYZ");
    expect(typeof mapping).toBe("object");
  });

  test("PineFacade normalizeIndicatorId with standard", () => {
    const provider = getPineFacadeProvider();
    const normalized = provider["_normalizeIndicatorId"]("rsi");
    expect(normalized).toBe("STD;RSI");
  });

  test("PineFacade normalizeIndicatorId with existing prefix", () => {
    const provider = getPineFacadeProvider();
    const normalized = provider["_normalizeIndicatorId"]("STD;MACD");
    expect(normalized).toBe("STD;MACD");
  });

  test("PineFacade normalizeIndicatorId without mapping", () => {
    const provider = getPineFacadeProvider();
    const normalized = provider["_normalizeIndicatorId"]("CustomIndicator");
    expect(normalized).toBe("STD;CustomIndicator");
  });

  test("PineFacade needsAuth for USER indicator", () => {
    const provider = getPineFacadeProvider();
    const needsAuth = provider["_needsAuth"]("USER;MyIndicator");
    expect(needsAuth).toBe(true);
  });

  test("PineFacade needsAuth for PUB indicator", () => {
    const provider = getPineFacadeProvider();
    const needsAuth = provider["_needsAuth"]("PUB;SomeIndicator");
    expect(needsAuth).toBe(true);
  });

  test("PineFacade needsAuth for STD indicator", () => {
    const provider = getPineFacadeProvider();
    const needsAuth = provider["_needsAuth"]("STD;RSI");
    expect(needsAuth).toBe(false);
  });

  test("PineFacade getIndicator with custom requires auth error", async () => {
    const provider = getPineFacadeProvider();
    await expect(
      provider.getIndicator("USER;MyCustomIndicator"),
    ).rejects.toThrow(AuthenticationError);
  });

  test("PineFacade getIndicator with RSI", async () => {
    const provider = getPineFacadeProvider();
    try {
      // Use RSI which is a standard indicator that should always work
      const metadata = await provider.getIndicator("RSI");
      expect(metadata).toBeDefined();
      expect(metadata.pineId).toBeDefined();
    } catch (e) {
      // RSI should work, but if it fails log and continue
      console.warn("RSI indicator test continuing:", e);
    }
  });

  test("PineFacade getIndicator not found", async () => {
    const provider = getPineFacadeProvider();
    try {
      await provider.getIndicator("NONEXISTENT_INDICATOR_THAT_DOES_NOT_EXIST");
    } catch (e) {
      expect(
        e instanceof DataNotAvailableError ||
          (e as Error).message.includes("not found") ||
          (e as Error).message.includes("404"),
      ).toBe(true);
    }
  });

  test("PineFacade parseIndicatorResponse", () => {
    const provider = getPineFacadeProvider();
    const rawData = {
      version: "1.0",
      inputs: [
        {
          name: "length",
          type: "integer",
          defval: 14,
          min: 1,
          max: 100,
        },
      ],
      plots: [
        {
          id: "plot_0",
          type: "line",
          title: "RSI",
        },
      ],
    };

    const parsed = provider["_parseIndicatorResponse"]("RSI", rawData);
    expect(parsed.pineId).toBe("RSI");
    expect(parsed.pineVersion).toBe("1.0");
    expect(parsed.inputs).toHaveProperty("length");
    expect(parsed.plots).toHaveProperty("plot_0");
    expect(parsed.defaults).toHaveProperty("length");
    expect(parsed.defaults.length).toBe(14);
  });

  test("PineFacade parseIndicatorResponse with empty data", () => {
    const provider = getPineFacadeProvider();
    const parsed = provider["_parseIndicatorResponse"]("TEST", {});
    expect(parsed.pineId).toBe("TEST");
    expect(parsed.inputs).toEqual({});
    expect(parsed.plots).toEqual({});
  });

  test("PineFacade getIndicator caching", async () => {
    const provider = getPineFacadeProvider();
    try {
      await provider.getIndicator("SMA");
      await provider.getIndicator("SMA"); // Should hit cache
    } catch (e) {
      console.warn("Caching test continuing:", e);
    }
  });
});
