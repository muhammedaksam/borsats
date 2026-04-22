/**
 * Tests for Eurobond historical daily prices (v0.8.7).
 *
 * - ZiraatEurobondProvider.iterBusinessDates
 * - ZiraatEurobondProvider.getHistory (mocked)
 * - Eurobond.history() integration
 */

import { ZiraatEurobondProvider } from "~/providers/ziraat-eurobond";
import { Eurobond } from "~/eurobond";

// ---------------------------------------------------------------------------
// iterBusinessDates
// ---------------------------------------------------------------------------

describe("ZiraatEurobondProvider.iterBusinessDates", () => {
  it("returns single day", () => {
    const d = new Date("2024-05-10"); // Friday
    const out = ZiraatEurobondProvider.iterBusinessDates(d, d);
    expect(out.length).toBe(1);
    expect(out[0].toISOString().split("T")[0]).toBe("2024-05-10");
  });

  it("skips weekends by default", () => {
    // Fri 2024-05-10 → Mon 2024-05-13
    const out = ZiraatEurobondProvider.iterBusinessDates(
      new Date("2024-05-10"),
      new Date("2024-05-13"),
    );
    expect(out.length).toBe(2); // Fri + Mon, skip Sat+Sun
  });

  it("includes weekends when flagged", () => {
    const out = ZiraatEurobondProvider.iterBusinessDates(
      new Date("2024-05-10"),
      new Date("2024-05-13"),
      false,
    );
    expect(out.length).toBe(4); // Fri, Sat, Sun, Mon
  });

  it("returns empty for end before start", () => {
    const out = ZiraatEurobondProvider.iterBusinessDates(
      new Date("2024-05-10"),
      new Date("2024-05-05"),
    );
    expect(out).toEqual([]);
  });

  it("returns full week (Mon-Fri)", () => {
    // Mon 2024-05-06 to Fri 2024-05-10
    const out = ZiraatEurobondProvider.iterBusinessDates(
      new Date("2024-05-06"),
      new Date("2024-05-10"),
    );
    expect(out.length).toBe(5);
    for (const d of out) {
      expect(d.getDay()).toBeGreaterThanOrEqual(1);
      expect(d.getDay()).toBeLessThanOrEqual(5);
    }
  });
});

// ---------------------------------------------------------------------------
// getHistory (mocked provider)
// ---------------------------------------------------------------------------

describe("ZiraatEurobondProvider.getHistory (mocked)", () => {
  function makeProvider(
    byDate: Record<string, Array<Record<string, unknown>>>,
  ): ZiraatEurobondProvider {
    const p = new ZiraatEurobondProvider();
    // Mock fetchBondsForDate by overriding the private method
    (p as unknown as Record<string, unknown>)["fetchBondsForDate"] = jest
      .fn()
      .mockImplementation(async (dateStr: string) => {
        return byDate[dateStr] || [];
      });
    return p;
  }

  it("filters to requested ISIN", async () => {
    const byDate: Record<string, Array<Record<string, unknown>>> = {
      "2024-05-06": [
        {
          isin: "TARGET",
          bidPrice: 100,
          bidYield: 5,
          askPrice: 101,
          askYield: 4.9,
          daysToMaturity: 1000,
        },
        {
          isin: "OTHER",
          bidPrice: 50,
          bidYield: 8,
          askPrice: 51,
          askYield: 7.8,
          daysToMaturity: 500,
        },
      ],
    };
    const p = makeProvider(byDate);
    const rows = await p.getHistory(
      "TARGET",
      new Date("2024-05-06"),
      new Date("2024-05-06"),
    );
    expect(rows.length).toBe(1);
    expect(rows[0].bidPrice).toBe(100);
  });

  it("drops zero-price rows", async () => {
    const byDate: Record<string, Array<Record<string, unknown>>> = {
      "2024-05-06": [
        {
          isin: "X",
          bidPrice: 100,
          bidYield: 5,
          askPrice: 101,
          askYield: 4.9,
          daysToMaturity: 1000,
        },
      ],
      "2024-05-07": [
        {
          isin: "X",
          bidPrice: 0,
          bidYield: 0,
          askPrice: 0,
          askYield: 0,
          daysToMaturity: 999,
        },
      ],
      "2024-05-08": [
        {
          isin: "X",
          bidPrice: null,
          bidYield: null,
          askPrice: null,
          askYield: null,
          daysToMaturity: 998,
        },
      ],
      "2024-05-09": [
        {
          isin: "X",
          bidPrice: 102,
          bidYield: 5.1,
          askPrice: 103,
          askYield: 5.0,
          daysToMaturity: 997,
        },
      ],
    };
    const p = makeProvider(byDate);
    const rows = await p.getHistory(
      "X",
      new Date("2024-05-06"),
      new Date("2024-05-09"),
    );
    expect(rows.length).toBe(2);
    const dates = rows.map((r) => r.date.toISOString().split("T")[0]);
    expect(dates).toEqual(["2024-05-06", "2024-05-09"]);
  });

  it("returns empty for missing ISIN", async () => {
    const byDate: Record<string, Array<Record<string, unknown>>> = {
      "2024-05-06": [
        {
          isin: "OTHER",
          bidPrice: 100,
          bidYield: 5,
          askPrice: 101,
          askYield: 4.9,
          daysToMaturity: 1000,
        },
      ],
    };
    const p = makeProvider(byDate);
    const rows = await p.getHistory(
      "MISSING",
      new Date("2024-05-06"),
      new Date("2024-05-06"),
    );
    expect(rows).toEqual([]);
  });

  it("sorts results by date", async () => {
    const byDate: Record<string, Array<Record<string, unknown>>> = {
      "2024-05-06": [
        {
          isin: "X",
          bidPrice: 100,
          bidYield: 5,
          askPrice: 101,
          askYield: 4.9,
          daysToMaturity: 1000,
        },
      ],
      "2024-05-07": [
        {
          isin: "X",
          bidPrice: 101,
          bidYield: 5.1,
          askPrice: 102,
          askYield: 5.0,
          daysToMaturity: 999,
        },
      ],
      "2024-05-08": [
        {
          isin: "X",
          bidPrice: 102,
          bidYield: 5.2,
          askPrice: 103,
          askYield: 5.1,
          daysToMaturity: 998,
        },
      ],
    };
    const p = makeProvider(byDate);
    const rows = await p.getHistory(
      "X",
      new Date("2024-05-06"),
      new Date("2024-05-08"),
    );
    const dates = rows.map((r) => r.date.getTime());
    const sorted = [...dates].sort((a, b) => a - b);
    expect(dates).toEqual(sorted);
  });

  it("normalizes ISIN to uppercase", async () => {
    const byDate: Record<string, Array<Record<string, unknown>>> = {
      "2024-05-06": [
        {
          isin: "US900123DG28",
          bidPrice: 100,
          bidYield: 5,
          askPrice: 101,
          askYield: 4.9,
          daysToMaturity: 1000,
        },
      ],
    };
    const p = makeProvider(byDate);
    const rows = await p.getHistory(
      "us900123dg28",
      new Date("2024-05-06"),
      new Date("2024-05-06"),
    );
    expect(rows.length).toBe(1);
  });

  it("returns empty for end before start", async () => {
    const p = makeProvider({});
    const rows = await p.getHistory(
      "X",
      new Date("2024-05-10"),
      new Date("2024-05-05"),
    );
    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Eurobond.history() — integration with mocked provider
// ---------------------------------------------------------------------------

describe("Eurobond.history()", () => {
  it("throws on unknown period", async () => {
    const bond = new Eurobond("TEST");
    await expect(bond.history({ period: "999y" })).rejects.toThrow(
      "Unknown period",
    );
  });
});
