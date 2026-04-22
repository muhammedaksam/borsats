/**
 * Tests for computeAdjClose (v0.8.6).
 *
 * Backward dividend adjustment yielding a yfinance-style Adj Close.
 */

import { computeAdjClose } from "~/ticker";
import { DividendData } from "~/types";

describe("computeAdjClose", () => {
  it("returns copy of closes when no dividends", () => {
    const closes = [100, 101, 102];
    const dates = [
      new Date("2024-01-01"),
      new Date("2024-01-02"),
      new Date("2024-01-03"),
    ];
    const result = computeAdjClose(closes, dates, []);
    expect(result).toEqual([100, 101, 102]);
    // Should be a copy, not the same reference
    result[0] = 999;
    expect(closes[0]).toBe(100);
  });

  it("returns empty array for empty input", () => {
    const result = computeAdjClose([], [], []);
    expect(result).toEqual([]);
  });

  it("returns copy when dividends is null-ish", () => {
    const closes = [100, 100];
    const dates = [new Date("2024-01-01"), new Date("2024-01-02")];
    const result = computeAdjClose(closes, dates, null as unknown as DividendData[]);
    expect(result).toEqual([100, 100]);
  });

  it("adjusts prices before single ex-dividend date", () => {
    // Close=100 on ex-date with $1 dividend → factor = 99/100 = 0.99
    const closes = [100, 100, 100, 100];
    const dates = [
      new Date("2024-01-01"),
      new Date("2024-01-02"),
      new Date("2024-01-03"),
      new Date("2024-01-04"),
    ];
    const divs: DividendData[] = [
      { date: new Date("2024-01-03"), dividend: 1.0, type: "dividend" },
    ];

    const result = computeAdjClose(closes, dates, divs);
    expect(result[0]).toBeCloseTo(99.0);
    expect(result[1]).toBeCloseTo(99.0);
    expect(result[2]).toBeCloseTo(100.0); // ex-date unchanged
    expect(result[3]).toBeCloseTo(100.0);
  });

  it("compounds multiple dividends", () => {
    // Two dividends:
    // Ex1: 2024-01-02, close=100, div=1 → factor_1 = 0.99 applied to row 0
    // Ex2: 2024-01-04, close=100, div=2 → factor_2 = 0.98 applied to rows 0,1,2
    const closes = [100, 100, 100, 100];
    const dates = [
      new Date("2024-01-01"),
      new Date("2024-01-02"),
      new Date("2024-01-03"),
      new Date("2024-01-04"),
    ];
    const divs: DividendData[] = [
      { date: new Date("2024-01-02"), dividend: 1.0, type: "dividend" },
      { date: new Date("2024-01-04"), dividend: 2.0, type: "dividend" },
    ];

    const result = computeAdjClose(closes, dates, divs);
    expect(result[0]).toBeCloseTo(100 * 0.99 * 0.98);
    expect(result[1]).toBeCloseTo(100 * 0.98);
    expect(result[2]).toBeCloseTo(100 * 0.98);
    expect(result[3]).toBeCloseTo(100.0);
  });

  it("skips dividends outside close date range", () => {
    const closes = [100, 100, 100];
    const dates = [
      new Date("2024-01-01"),
      new Date("2024-01-02"),
      new Date("2024-01-03"),
    ];
    const divs: DividendData[] = [
      { date: new Date("2025-06-01"), dividend: 5.0, type: "dividend" },
    ];

    const result = computeAdjClose(closes, dates, divs);
    expect(result).toEqual([100, 100, 100]);
  });

  it("skips zero or negative dividend amounts", () => {
    const closes = [100, 100, 100];
    const dates = [
      new Date("2024-01-01"),
      new Date("2024-01-02"),
      new Date("2024-01-03"),
    ];
    const divs: DividendData[] = [
      { date: new Date("2024-01-02"), dividend: 0.0, type: "dividend" },
      { date: new Date("2024-01-03"), dividend: -1.0, type: "dividend" },
    ];

    const result = computeAdjClose(closes, dates, divs);
    expect(result).toEqual([100, 100, 100]);
  });

  it("skips adjustment when close on ex-date is zero", () => {
    const closes = [100, 0, 100];
    const dates = [
      new Date("2024-01-01"),
      new Date("2024-01-02"),
      new Date("2024-01-03"),
    ];
    const divs: DividendData[] = [
      { date: new Date("2024-01-02"), dividend: 1.0, type: "dividend" },
    ];

    const result = computeAdjClose(closes, dates, divs);
    // No adjustment because close_on_ex <= 0
    expect(result).toEqual([100, 0, 100]);
  });

  it("returns a copy when unchanged", () => {
    const closes = [100, 100];
    const dates = [new Date("2024-01-01"), new Date("2024-01-02")];
    const divs: DividendData[] = [];
    const result = computeAdjClose(closes, dates, divs);
    result[0] = 999;
    expect(closes[0]).toBe(100);
  });
});
