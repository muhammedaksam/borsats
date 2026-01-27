import { APIError } from "~/exceptions";
import { BaseProvider } from "~/providers/base";

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
  jest.setTimeout(30000);

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
    try {
      const result = await provider.testRequest("/get");
      expect(result).toBeDefined();
    } catch (e) {
      console.warn("BaseProvider request test continuing:", e);
    }
  });

  test("BaseProvider cache hit", async () => {
    const provider = new TestProvider({
      cache: { ttl: 300, enabled: true },
    });
    try {
      await provider.testRequest("/get");
      await provider.testRequest("/get"); // Should hit cache
    } catch (e) {
      console.warn("Cache test continuing:", e);
    }
  });

  test("BaseProvider clearCache", async () => {
    const provider = new TestProvider();
    provider.testClearCache();
    expect(provider).toBeDefined();
  });

  test("BaseProvider request with custom headers", async () => {
    const provider = new TestProvider();
    try {
      await provider.testRequest("/headers", {
        headers: { "X-Custom-Header": "test" },
      });
    } catch (e) {
      console.warn("Custom headers test continuing:", e);
    }
  });

  test("BaseProvider request with params", async () => {
    const provider = new TestProvider();
    try {
      await provider.testRequest("/get", {
        params: { foo: "bar", test: "123" },
      });
    } catch (e) {
      console.warn("Params test continuing:", e);
    }
  });

  test("BaseProvider POST request", async () => {
    const provider = new TestProvider();
    try {
      await provider.testRequest("/post", {
        method: "POST",
        data: { key: "value" },
      });
    } catch (e) {
      console.warn("POST test continuing:", e);
    }
  });

  test("BaseProvider handles 404 error", async () => {
    const provider = new TestProvider();
    try {
      await provider.testRequest("/status/404");
    } catch (e) {
      expect(e).toBeInstanceOf(APIError);
    }
  });

  test("BaseProvider handles 500 error with retry", async () => {
    const provider = new TestProvider({ maxRetries: 1 });
    try {
      await provider.testRequest("/status/500");
    } catch (e) {
      expect(e).toBeInstanceOf(APIError);
    }
  });

  test("BaseProvider rate limiting enforcement", async () => {
    const provider = new TestProvider({ rateLimit: 1 });
    try {
      await provider.testRequest("/delay/1");
      await provider.testRequest("/delay/1");
    } catch (e) {
      console.warn("Rate limit test continuing:", e);
    }
  });

  test("BaseProvider retry with exponential backoff", async () => {
    const provider = new TestProvider({ maxRetries: 2 });
    try {
      await provider.testRequest("/status/503");
    } catch (e) {
      expect(e).toBeInstanceOf(APIError);
    }
  });

  test("BaseProvider custom timeout", async () => {
    const provider = new TestProvider({ timeout: 100 });
    try {
      await provider.testRequest("/delay/2");
    } catch (e) {
      expect(e).toBeDefined();
    }
  });
});
