import axios from "axios";
import { APIError } from "~/exceptions";
import { BaseProvider } from "~/providers/base";
import { sleep } from "~/utils/helpers";

// Mock axios
jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock sleep to resolve immediately so tests run instantly
jest.mock("~/utils/helpers", () => {
  const original = jest.requireActual("~/utils/helpers");
  return {
    ...original,
    sleep: jest.fn().mockResolvedValue(undefined),
  };
});

const mockedSleep = sleep as jest.MockedFunction<typeof sleep>;

const mockClient = {
  request: jest.fn(),
};
mockedAxios.create.mockReturnValue(mockClient as any);
mockedAxios.isAxiosError.mockImplementation((err: any) => err?.isAxiosError === true);

// TestProvider extends BaseProvider for testing purposes
class TestProvider extends BaseProvider {
  constructor(config = {}) {
    super({ baseUrl: "https://httpbin.org", ...config });
  }

  public async testRequest<T>(
    url: string,
    options: Record<string, unknown> = {},
  ) {
    return this.request<T>(url, options);
  }

  public testClearCache() {
    this.clearCache();
  }
}

describe("BaseProvider Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("BaseProvider construction with default config", () => {
    const provider = new TestProvider();
    expect(provider).toBeDefined();
  });

  test("BaseProvider construction with custom config", () => {
    const provider = new TestProvider({
      timeout: 5000,
      maxRetries: 2,
      rateLimit: 30,
      cache: {
        ttl: 120,
        enabled: false,
      },
    });
    expect(provider).toBeDefined();
  });

  test("BaseProvider successful request", async () => {
    const provider = new TestProvider();
    mockClient.request.mockResolvedValue({ data: { foo: "bar" } });

    const result = await provider.testRequest("/get");
    expect(result).toEqual({ foo: "bar" });
    expect(mockClient.request).toHaveBeenCalledTimes(1);
  });

  test("BaseProvider cache hit", async () => {
    const provider = new TestProvider({
      cache: { ttl: 300, enabled: true },
    });
    mockClient.request.mockResolvedValue({ data: { foo: "bar" } });

    const result1 = await provider.testRequest("/get");
    const result2 = await provider.testRequest("/get"); // Should hit cache

    expect(result1).toEqual({ foo: "bar" });
    expect(result2).toEqual({ foo: "bar" });
    expect(mockClient.request).toHaveBeenCalledTimes(1);
  });

  test("BaseProvider clearCache", async () => {
    const provider = new TestProvider({
      cache: { ttl: 300, enabled: true },
    });
    mockClient.request.mockResolvedValue({ data: { foo: "bar" } });

    await provider.testRequest("/get");
    provider.testClearCache();
    await provider.testRequest("/get"); // Should request again after clearCache

    expect(mockClient.request).toHaveBeenCalledTimes(2);
  });

  test("BaseProvider request with custom headers", async () => {
    const provider = new TestProvider();
    mockClient.request.mockResolvedValue({ data: {} });

    await provider.testRequest("/headers", {
      headers: { "X-Custom-Header": "test" },
    });

    expect(mockClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { "X-Custom-Header": "test" },
      })
    );
  });

  test("BaseProvider request with params", async () => {
    const provider = new TestProvider();
    mockClient.request.mockResolvedValue({ data: {} });

    await provider.testRequest("/get", {
      params: { foo: "bar", test: "123" },
    });

    expect(mockClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { foo: "bar", test: "123" },
      })
    );
  });

  test("BaseProvider POST request", async () => {
    const provider = new TestProvider();
    mockClient.request.mockResolvedValue({ data: {} });

    await provider.testRequest("/post", {
      method: "POST",
      data: { key: "value" },
    });

    expect(mockClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        data: { key: "value" },
      })
    );
  });

  test("BaseProvider handles 404 error", async () => {
    const provider = new TestProvider();
    const axiosError = new Error("Not Found") as any;
    axiosError.isAxiosError = true;
    axiosError.response = { status: 404, data: "Not Found" };
    mockClient.request.mockRejectedValue(axiosError);

    await expect(provider.testRequest("/status/404")).rejects.toThrow(APIError);
  });

  test("BaseProvider handles 500 error with retry", async () => {
    const provider = new TestProvider({ maxRetries: 1 });
    const axiosError = new Error("Internal Server Error") as any;
    axiosError.isAxiosError = true;
    axiosError.response = { status: 500 };
    mockClient.request.mockRejectedValue(axiosError);

    await expect(provider.testRequest("/status/500")).rejects.toThrow(APIError);
    expect(mockClient.request).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
  });

  test("BaseProvider rate limiting enforcement", async () => {
    const provider = new TestProvider({ rateLimit: 1, cache: { enabled: false } });
    mockClient.request.mockResolvedValue({ data: { success: true } });

    await provider.testRequest("/get1");
    await provider.testRequest("/get2"); // Second request triggers rate limit

    expect(mockClient.request).toHaveBeenCalledTimes(2);
    expect(mockedSleep).toHaveBeenCalled();
  });

  test("BaseProvider retry with exponential backoff", async () => {
    const provider = new TestProvider({ maxRetries: 2 });
    const axiosError = new Error("Service Unavailable") as any;
    axiosError.isAxiosError = true;
    axiosError.response = { status: 503 };
    mockClient.request.mockRejectedValue(axiosError);

    await expect(provider.testRequest("/status/503")).rejects.toThrow(APIError);
    expect(mockClient.request).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    expect(mockedSleep).toHaveBeenCalledTimes(2); // Should backoff twice
  });

  test("BaseProvider custom timeout", async () => {
    const provider = new TestProvider({ timeout: 100 });
    const timeoutError = new Error("timeout of 100ms exceeded") as any;
    timeoutError.isAxiosError = true;
    timeoutError.code = "ECONNABORTED";
    mockClient.request.mockRejectedValue(timeoutError);

    await expect(provider.testRequest("/delay/2")).rejects.toThrow();
  });
});
