import { calculateHeikinAshi } from "~/charts";
import { OHLCVData } from "~/types";

describe("Charts - Heikin Ashi", () => {
  test("should return empty array for empty input", () => {
    expect(calculateHeikinAshi([])).toEqual([]);

    expect(calculateHeikinAshi(null)).toEqual([]);
  });

  test("should calculate correct first candle values", () => {
    const data: OHLCVData[] = [
      { date: new Date(1), open: 10, high: 20, low: 5, close: 15, volume: 100 },
    ];
    const result = calculateHeikinAshi(data);

    expect(result).toHaveLength(1);
    const ha = result[0];

    // HA_Close = (10 + 20 + 5 + 15) / 4 = 50 / 4 = 12.5
    expect(ha.close).toBe(12.5);

    // HA_Open = (10 + 15) / 2 = 12.5
    expect(ha.open).toBe(12.5);

    // HA_High = max(20, 12.5, 12.5) = 20
    expect(ha.high).toBe(20);

    // HA_Low = min(5, 12.5, 12.5) = 5
    expect(ha.low).toBe(5);
  });

  test("should calculate correct subsequent candle values", () => {
    const data: OHLCVData[] = [
      { date: new Date(1), open: 10, high: 20, low: 5, close: 15, volume: 100 },
      {
        date: new Date(2),
        open: 15,
        high: 25,
        low: 10,
        close: 20,
        volume: 200,
      },
    ];

    const result = calculateHeikinAshi(data);
    expect(result).toHaveLength(2);

    const _prev = result[0]; // Open: 12.5, Close: 12.5
    const curr = result[1];

    // HA_Open = (prevOpen + prevClose) / 2 = (12.5 + 12.5) / 2 = 12.5
    expect(curr.open).toBe(12.5);

    // HA_Close = (15 + 25 + 10 + 20) / 4 = 70 / 4 = 17.5
    expect(curr.close).toBe(17.5);

    // HA_High = max(25, 12.5, 17.5) = 25
    expect(curr.high).toBe(25);

    // HA_Low = min(10, 12.5, 17.5) = 10
    expect(curr.low).toBe(10);

    expect(curr.volume).toBe(200);
    expect(curr.date).toEqual(new Date(2));
  });
});
