import { AuthenticationError, DataNotAvailableError } from "~/exceptions";
import {
  clearIndicatorCache,
  getPineFacadeProvider,
  INDICATOR_OUTPUTS,
  STANDARD_INDICATORS,
} from "~/providers/pine-facade";

describe("PineFacade Provider Tests", () => {
  beforeEach(() => {
    clearIndicatorCache();
    jest.restoreAllMocks();
  });

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
    expect(provider1).toBe(provider2);
  });

  test("PineFacade getIndicator fetches and caches standard indicator", async () => {
    const provider = getPineFacadeProvider();
    const client = (
      provider as unknown as {
        client: { get: (u: string, c?: unknown) => Promise<{ data: unknown }> };
      }
    ).client;
    const reqSpy = jest.spyOn(client, "get").mockResolvedValue({
      data: {
        version: "2.0",
        inputs: [{ name: "length", type: "integer", defval: 14 }],
        plots: [{ id: "plot_0", type: "line", title: "RSI" }],
      },
    });

    const first = await provider.getIndicator("RSI");
    const second = await provider.getIndicator("RSI");
    expect(first.pineId).toBe("RSI");
    expect(second).toEqual(first);
    expect(reqSpy).toHaveBeenCalledTimes(1);
  });

  test("PineFacade getIndicator throws DataNotAvailableError on 404", async () => {
    const provider = getPineFacadeProvider();
    const client = (
      provider as unknown as {
        client: { get: (u: string, c?: unknown) => Promise<unknown> };
      }
    ).client;
    const err = Object.assign(new Error("Request failed with status code 404"), {
      isAxiosError: true,
      response: { status: 404 },
    });
    jest.spyOn(client, "get").mockRejectedValueOnce(err);

    await expect(
      provider.getIndicator("NONEXISTENT_INDICATOR_THAT_DOES_NOT_EXIST"),
    ).rejects.toThrow(DataNotAvailableError);
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
});
