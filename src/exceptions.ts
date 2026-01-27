/**
 * Base error class for all BorsaTS errors
 */
export class BorsaTSError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BorsaTSError";
    Object.setPrototypeOf(this, BorsaTSError.prototype);
  }
}

/**
 * Thrown when a ticker symbol is not found
 */
export class TickerNotFoundError extends BorsaTSError {
  constructor(symbol: string) {
    super(`Ticker not found: ${symbol}`);
    this.name = "TickerNotFoundError";
    Object.setPrototypeOf(this, TickerNotFoundError.prototype);
  }
}

/**
 * Thrown when requested data is not available
 */
export class DataNotAvailableError extends BorsaTSError {
  constructor(message: string) {
    super(message);
    this.name = "DataNotAvailableError";
    Object.setPrototypeOf(this, DataNotAvailableError.prototype);
  }
}

/**
 * Thrown when an API request fails
 */
export class APIError extends BorsaTSError {
  public statusCode?: number;
  public response?: unknown;

  constructor(message: string, statusCode?: number, response?: unknown) {
    super(message);
    this.name = "APIError";
    this.statusCode = statusCode;
    this.response = response;
    Object.setPrototypeOf(this, APIError.prototype);
  }
}

/**
 * Thrown when authentication fails
 */
export class AuthenticationError extends BorsaTSError {
  constructor(message: string = "Authentication failed") {
    super(message);
    this.name = "AuthenticationError";
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * Thrown when rate limit is exceeded
 */
export class RateLimitError extends BorsaTSError {
  public retryAfter?: number;

  constructor(message: string = "Rate limit exceeded", retryAfter?: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Thrown when an invalid period is provided
 */
export class InvalidPeriodError extends BorsaTSError {
  constructor(period: string, validPeriods: string[]) {
    super(
      `Invalid period: ${period}. Valid periods are: ${validPeriods.join(", ")}`,
    );
    this.name = "InvalidPeriodError";
    Object.setPrototypeOf(this, InvalidPeriodError.prototype);
  }
}

/**
 * Thrown when an invalid interval is provided
 */
export class InvalidIntervalError extends BorsaTSError {
  constructor(interval: string, validIntervals: string[]) {
    super(
      `Invalid interval: ${interval}. Valid intervals are: ${validIntervals.join(", ")}`,
    );
    this.name = "InvalidIntervalError";
    Object.setPrototypeOf(this, InvalidIntervalError.prototype);
  }
}
