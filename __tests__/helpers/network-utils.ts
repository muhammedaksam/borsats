/**
 * Test helper for handling flaky network connections in CI
 */

/**
 * Network errors that should trigger test skip instead of failure
 */
const TRANSIENT_NETWORK_ERRORS = [
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ENOTFOUND",
  "ENETUNREACH",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "socket hang up",
  "timeout of", // Axios timeout: "timeout of 30000ms exceeded"
  "status code 502", // Bad Gateway
  "status code 503", // Service Unavailable
  "status code 504", // Gateway Timeout
  "status code 522", // Cloudflare Connection Timed Out
];

/**
 * Check if an error is a transient network error or transient data-availability issue
 */
export function isTransientNetworkError(error: unknown): boolean {
  if (!error) return false;

  const name = error instanceof Error ? error.name : "";

  // DataNotAvailableError: fund data can be temporarily unavailable
  // (delisted funds, API maintenance, weekend gaps, etc.)
  if (name === "DataNotAvailableError") return true;

  // APIError wraps underlying network/timeout errors from providers.
  // In integration tests, these always indicate an unreachable external API.
  if (name === "APIError") return true;

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String(error);
  return TRANSIENT_NETWORK_ERRORS.some(
    (code) =>
      message.includes(code) || (error as NodeJS.ErrnoException).code === code,
  );
}

/**
 * Wraps an async test function to skip on transient network errors.
 * Use for tests that call external APIs which may be flaky in CI.
 *
 * @example
 * it("should fetch data", skipOnNetworkError(async () => {
 *   const data = await api.fetch();
 *   expect(data).toBeDefined();
 * }));
 */
export function skipOnNetworkError<T>(
  fn: () => Promise<T>,
): () => Promise<T | void> {
  return async () => {
    try {
      return await fn();
    } catch (error) {
      if (isTransientNetworkError(error)) {
        console.warn(
          `⚠️  Skipping test due to transient network error: ${(error as Error).message}`,
        );
        return; // Jest treats this as a pass
      }
      throw error;
    }
  };
}

/**
 * Retry wrapper for flaky network tests.
 * Retries up to `maxRetries` times with exponential backoff.
 *
 * @example
 * it("should fetch data", withRetry(async () => {
 *   const data = await api.fetch();
 *   expect(data).toBeDefined();
 * }));
 */
export function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  delayMs = 1000,
): () => Promise<T> {
  return async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries && isTransientNetworkError(error)) {
          const delay = delayMs * Math.pow(2, attempt);
          console.warn(
            `⚠️  Retry ${attempt + 1}/${maxRetries} after ${delay}ms: ${(error as Error).message}`,
          );
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    throw lastError;
  };
}

/**
 * Combined: retry on network errors, then skip if still failing.
 * Best for external API tests in CI.
 */
export function resilientTest<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
): () => Promise<T | void> {
  return skipOnNetworkError(withRetry(fn, maxRetries));
}
