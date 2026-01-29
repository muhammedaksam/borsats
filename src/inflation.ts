import { getTCMBProvider, InflationData } from "~/providers/tcmb";

/**
 * Inflation class
 */
export class Inflation {
  /**
   * Get latest inflation data
   *
   * @param inflationType 'tufe' (CPI) or 'ufe' (PPI)
   */
  async latest(inflationType: "tufe" | "ufe" = "tufe") {
    const provider = getTCMBProvider();
    const latest = await provider.getLatest(inflationType);

    return {
      year: latest.date.getFullYear(),
      month: latest.date.getMonth() + 1,
      value: latest.yearlyInflation,
      monthlyChange: latest.monthlyInflation,
      annualChange: latest.yearlyInflation,
    };
  }

  /**
   * Get TÜFE (Consumer Price Index) data
   */
  async tufe(
    options: {
      start?: string | Date;
      end?: string | Date;
      limit?: number;
    } = {},
  ): Promise<InflationData[]> {
    return getTCMBProvider().getData("tufe", options);
  }

  /**
   * Get ÜFE (Producer Price Index) data
   */
  async ufe(
    options: {
      start?: string | Date;
      end?: string | Date;
      limit?: number;
    } = {},
  ): Promise<InflationData[]> {
    return getTCMBProvider().getData("ufe", options);
  }

  /**
   * Calculate inflation-adjusted value
   */
  async calculate(
    amount: number,
    startDate: string,
    endDate: string,
  ): Promise<{
    initialAmount: number;
    finalAmount: number;
    totalInflation: number;
    multiplier: number;
  }> {
    const provider = getTCMBProvider();
    // Parse dates from YYYY-MM
    const startParts = startDate.split("-").map(Number);
    const endParts = endDate.split("-").map(Number);

    // Check if parts are valid
    if (startParts.length < 2 || endParts.length < 2) {
      throw new Error("Invalid date format. Use YYYY-MM");
    }

    const res = await provider.calculateInflation(
      startParts[0],
      startParts[1],
      endParts[0],
      endParts[1],
      amount,
    );

    return {
      initialAmount: res.initialValue,
      finalAmount: res.finalValue,
      totalInflation: res.totalChange,
      multiplier: res.finalValue / res.initialValue,
    };
  }
}
