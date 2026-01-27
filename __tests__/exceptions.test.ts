import {
  APIError,
  AuthenticationError,
  BorsaTSError,
  DataNotAvailableError,
  InvalidIntervalError,
  InvalidPeriodError,
  RateLimitError,
  TickerNotFoundError,
} from "~/exceptions";

describe("Exceptions Module", () => {
  test("BorsaTSError", () => {
    const error = new BorsaTSError("test error");
    expect(error.name).toBe("BorsaTSError");
    expect(error.message).toBe("test error");
    expect(error instanceof Error).toBe(true);
  });

  test("TickerNotFoundError", () => {
    const error = new TickerNotFoundError("INVALID");
    expect(error.name).toBe("TickerNotFoundError");
    expect(error.message).toContain("INVALID");
    expect(error instanceof BorsaTSError).toBe(true);
  });

  test("DataNotAvailableError", () => {
    const error = new DataNotAvailableError("no data available");
    expect(error.name).toBe("DataNotAvailableError");
    expect(error.message).toBe("no data available");
  });

  test("APIError with all parameters", () => {
    const error = new APIError("api failed", 500, { detail: "server error" });
    expect(error.name).toBe("APIError");
    expect(error.statusCode).toBe(500);
    expect(error.response).toEqual({ detail: "server error" });
  });

  test("APIError without optional params", () => {
    const error = new APIError("simple error");
    expect(error.statusCode).toBeUndefined();
    expect(error.response).toBeUndefined();
  });

  test("AuthenticationError with default message", () => {
    const error = new AuthenticationError();
    expect(error.name).toBe("AuthenticationError");
    expect(error.message).toBe("Authentication failed");
  });

  test("AuthenticationError with custom message", () => {
    const error = new AuthenticationError("custom auth error");
    expect(error.message).toBe("custom auth error");
  });

  test("RateLimitError with default message", () => {
    const error = new RateLimitError();
    expect(error.name).toBe("RateLimitError");
    expect(error.message).toBe("Rate limit exceeded");
    expect(error.retryAfter).toBeUndefined();
  });

  test("RateLimitError with retryAfter", () => {
    const error = new RateLimitError("limit hit", 60);
    expect(error.retryAfter).toBe(60);
  });

  test("InvalidPeriodError", () => {
    const error = new InvalidPeriodError("2w", ["1d", "1mo", "1y"]);
    expect(error.name).toBe("InvalidPeriodError");
    expect(error.message).toContain("2w");
    expect(error.message).toContain("1d, 1mo, 1y");
  });

  test("InvalidIntervalError", () => {
    const error = new InvalidIntervalError("2m", ["1m", "5m", "1d"]);
    expect(error.name).toBe("InvalidIntervalError");
    expect(error.message).toContain("2m");
    expect(error.message).toContain("1m, 5m, 1d");
  });
});
