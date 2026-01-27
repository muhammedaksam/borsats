import { getTCMBProvider } from "@/providers/tcmb";

/**
 * Inflation class
 */
export class Inflation {
  /**
   * Get latest inflation data
   */
  async latest(): Promise<Record<string, number>> {
    const provider = getTCMBProvider();
    const tufe = await provider.getLatest("tufe");
    const ufe = await provider.getLatest("ufe");

    return {
      tufe_yearly: tufe.yearlyInflation,
      tufe_monthly: tufe.monthlyInflation,
      ufe_yearly: ufe.yearlyInflation,
      ufe_monthly: ufe.monthlyInflation,
    };
  }

  /**
   * Calculate inflation-adjusted value
   */
  async calculate(
    amount: number,
    startDate: string,
    endDate: string,
  ): Promise<number> {
    const provider = getTCMBProvider();
    // Parse dates from YYYY-MM-DD
    const startParts = startDate.split("-").map(Number);
    const endParts = endDate.split("-").map(Number);

    // Check if parts are valid
    if (startParts.length < 2 || endParts.length < 2) {
      throw new Error("Invalid date format. Use YYYY-MM");
    }

    const result = await provider.calculateInflation(
      startParts[0],
      startParts[1],
      endParts[0],
      endParts[1],
      amount,
    );

    return result.finalValue;
  }
}
