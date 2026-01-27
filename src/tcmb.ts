/**
 * TCMB (Turkish Central Bank) interest rates.
 *
 * Provides access to TCMB policy rates:
 * - 1-week repo rate (policy rate)
 * - Overnight (O/N) corridor rates
 * - Late liquidity window (LON) rates
 */

import {
  AllRatesRecord,
  getTCMBRatesProvider,
  RateRecord,
} from "@/providers/tcmb-rates";

export { RateRecord, AllRatesRecord };

/**
 * Period mapping for history filtering
 */
const PERIOD_DAYS: Record<string, number> = {
  "1w": 7,
  "1mo": 30,
  "3mo": 90,
  "6mo": 180,
  "1y": 365,
  "2y": 730,
  "5y": 1825,
  "10y": 3650,
};

/**
 * TCMB interest rates interface
 */
export class TCMB {
  /**
   * Get current 1-week repo rate (policy rate)
   */
  get policyRate(): Promise<number | null> {
    return getTCMBRatesProvider()
      .getPolicyRate()
      .then((data) => data.lending);
  }

  /**
   * Get overnight (O/N) corridor rates
   */
  get overnight(): Promise<{
    borrowing: number | null;
    lending: number | null;
  }> {
    return getTCMBRatesProvider()
      .getOvernightRates()
      .then((data) => ({
        borrowing: data.borrowing,
        lending: data.lending,
      }));
  }

  /**
   * Get late liquidity window (LON) rates
   */
  get lateLiquidity(): Promise<{
    borrowing: number | null;
    lending: number | null;
  }> {
    return getTCMBRatesProvider()
      .getLateLiquidityRates()
      .then((data) => ({
        borrowing: data.borrowing,
        lending: data.lending,
      }));
  }

  /**
   * Get all current rates
   */
  get rates(): Promise<AllRatesRecord[]> {
    return getTCMBRatesProvider().getAllRates();
  }

  /**
   * Get historical rates for given type
   */
  async history(
    rateType: "policy" | "overnight" | "late_liquidity" = "policy",
    period?: string,
  ): Promise<RateRecord[]> {
    const data = await getTCMBRatesProvider().getRateHistory(rateType);

    if (period && period.toLowerCase() !== "max") {
      const days = PERIOD_DAYS[period.toLowerCase()];
      if (days) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        return data.filter((r) => r.date && r.date >= cutoff);
      }
    }

    return data;
  }
}

/**
 * Get current TCMB policy rate (1-week repo)
 */
export async function policyRate(): Promise<number | null> {
  return new TCMB().policyRate;
}
