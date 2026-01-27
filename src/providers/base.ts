import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";

import { APIError, RateLimitError } from "~/exceptions";
import { ProviderConfig, RequestOptions } from "~/types";
import { SimpleCache, sleep } from "~/utils/helpers";

/**
 * Abstract base class for all data providers
 */
export abstract class BaseProvider {
  protected client: AxiosInstance;
  protected cache: SimpleCache<unknown>;
  protected config: ProviderConfig;
  private lastRequestTime: number = 0;
  private requestCount: number = 0;
  private resetTime: number = Date.now() + 60000;

  constructor(config: ProviderConfig = {}) {
    this.config = {
      timeout: 30000,
      maxRetries: 3,
      rateLimit: 60, // requests per minute
      cache: {
        ttl: 300, // 5 minutes default
        enabled: true,
      },
      ...config,
    };

    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    this.cache = new SimpleCache<unknown>();
  }

  /**
   * Make an HTTP request with retry logic and rate limiting
   */
  protected async request<T>(
    url: string,
    options: RequestOptions = {},
  ): Promise<T> {
    // Check cache first
    const cacheKey = this.getCacheKey(url, options);
    if (this.config.cache?.enabled && options.method !== "POST") {
      const cached = this.cache.get(cacheKey) as T | undefined;
      if (cached !== undefined) {
        return cached;
      }
    }

    // Rate limiting
    await this.enforceRateLimit();

    // Prepare request config
    const requestConfig: AxiosRequestConfig = {
      url,
      method: options.method || "GET",
      headers: options.headers,
      params: options.params,
      data: options.data,
      timeout: options.timeout || this.config.timeout,
    };

    // Retry logic
    const maxRetries = options.maxRetries ?? this.config.maxRetries ?? 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response: AxiosResponse<T> =
          await this.client.request(requestConfig);

        // Cache successful response
        if (this.config.cache?.enabled && options.method !== "POST") {
          this.cache.set(cacheKey, response.data, this.config.cache.ttl);
        }

        return response.data;
      } catch (error: unknown) {
        lastError = error as Error;

        if (axios.isAxiosError(error)) {
          const status = error.response?.status;

          // Don't retry on client errors (4xx except 429)
          if (status && status >= 400 && status < 500 && status !== 429) {
            throw new APIError(
              error.message || "API request failed",
              status,
              error.response?.data,
            );
          }

          // Handle rate limit
          if (status === 429) {
            const retryAfter = parseInt(
              error.response?.headers["retry-after"] || "60",
              10,
            );
            if (attempt === maxRetries) {
              throw new RateLimitError("Rate limit exceeded", retryAfter);
            }
            await sleep(retryAfter * 1000);
            continue;
          }

          // Retry on network errors or 5xx
          if (attempt < maxRetries) {
            const backoff = Math.min(1000 * Math.pow(2, attempt), 10000);
            await sleep(backoff);
            continue;
          }
        }

        // Last attempt failed
        throw new APIError(
          lastError?.message || "Request failed",
          undefined,
          lastError,
        );
      }
    }

    throw new APIError("Max retries exceeded", undefined, lastError);
  }

  /**
   * Enforce rate limiting
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();

    // Reset counter every minute
    if (now >= this.resetTime) {
      this.requestCount = 0;
      this.resetTime = now + 60000;
    }

    // Check if we've exceeded rate limit
    if (this.requestCount >= (this.config.rateLimit || 60)) {
      const waitTime = this.resetTime - now;
      await sleep(waitTime);
      this.requestCount = 0;
      this.resetTime = Date.now() + 60000;
    }

    // Minimum delay between requests (100ms)
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < 100) {
      await sleep(100 - timeSinceLastRequest);
    }

    this.requestCount++;
    this.lastRequestTime = Date.now();
  }

  /**
   * Generate cache key from URL and options
   */
  private getCacheKey(url: string, options: RequestOptions): string {
    const method = options.method || "GET";
    const params = JSON.stringify(options.params || {});
    return `${method}:${url}:${params}`;
  }

  /**
   * Clear the cache
   */
  public clearCache(): void {
    this.cache.clear();
  }
}
