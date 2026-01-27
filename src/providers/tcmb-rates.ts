/**
 * TCMB interest rates provider.
 * Fetches central bank policy rates from tcmb.gov.tr
 */

import { BaseProvider } from "@/providers/base";
import { TTL } from "@/utils/helpers";
import * as cheerio from "cheerio";

const TCMB_URLS: Record<string, string> = {
  policy:
    "https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Temel+Faaliyetler/Para+Politikasi/Merkez+Bankasi+Faiz+Oranlari/1+Hafta+Repo",
  overnight:
    "https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Temel+Faaliyetler/Para+Politikasi/Merkez+Bankasi+Faiz+Oranlari/faiz-oranlari",
  late_liquidity:
    "https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Temel+Faaliyetler/Para+Politikasi/Merkez+Bankasi+Faiz+Oranlari/Gec+Likidite+Penceresi+%28LON%29",
};

export interface RateRecord {
  date: Date | null;
  borrowing: number | null;
  lending: number | null;
}

export interface AllRatesRecord extends RateRecord {
  rateType: string;
}

export class TCMBRatesProvider extends BaseProvider {
  private parseTurkishNumber(text: string): number | null {
    const cleaned = text.trim();
    if (!cleaned || cleaned === "-") return null;
    try {
      return parseFloat(cleaned.replace(",", "."));
    } catch {
      return null;
    }
  }

  private parseDate(text: string): Date | null {
    const cleaned = text.trim();
    if (!cleaned) return null;

    const parts = cleaned.split(".");
    if (parts.length !== 3) return null;

    try {
      const day = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1;
      let year = parseInt(parts[2]);
      if (year < 100) year += 2000;
      return new Date(year, month, day);
    } catch {
      return null;
    }
  }

  private async fetchAndParseTable(url: string): Promise<RateRecord[]> {
    const cacheKey = `tcmb_rates:${url}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached as RateRecord[];

    const response = await this.client.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    const $ = cheerio.load(response.data);
    const table = $("table").first();
    if (!table.length) return [];

    const rows = table.find("tr");
    const results: RateRecord[] = [];

    rows.each((i, row) => {
      if (i === 0) return; // Skip header
      const cols = $(row).find("td");
      if (cols.length < 3) return;

      const date = this.parseDate(cols.eq(0).text());
      const borrowing = this.parseTurkishNumber(cols.eq(1).text());
      const lending = this.parseTurkishNumber(cols.eq(2).text());

      if (date) {
        results.push({ date, borrowing, lending });
      }
    });

    this.cache.set(cacheKey, results, TTL.FX_RATES);
    return results;
  }

  async getPolicyRate(): Promise<{
    date: Date | null;
    lending: number | null;
  }> {
    const data = await this.fetchAndParseTable(TCMB_URLS.policy);
    if (!data.length) return { date: null, lending: null };
    return { date: data[0].date, lending: data[0].lending };
  }

  async getOvernightRates(): Promise<RateRecord> {
    const data = await this.fetchAndParseTable(TCMB_URLS.overnight);
    if (!data.length) return { date: null, borrowing: null, lending: null };
    return data[0];
  }

  async getLateLiquidityRates(): Promise<RateRecord> {
    const data = await this.fetchAndParseTable(TCMB_URLS.late_liquidity);
    if (!data.length) return { date: null, borrowing: null, lending: null };
    return data[0];
  }

  async getAllRates(): Promise<AllRatesRecord[]> {
    const [policy, overnight, lateLiquidity] = await Promise.all([
      this.getPolicyRate(),
      this.getOvernightRates(),
      this.getLateLiquidityRates(),
    ]);

    return [
      {
        rateType: "policy",
        date: policy.date,
        borrowing: null,
        lending: policy.lending,
      },
      {
        rateType: "overnight",
        date: overnight.date,
        borrowing: overnight.borrowing,
        lending: overnight.lending,
      },
      {
        rateType: "late_liquidity",
        date: lateLiquidity.date,
        borrowing: lateLiquidity.borrowing,
        lending: lateLiquidity.lending,
      },
    ];
  }

  async getRateHistory(
    rateType: "policy" | "overnight" | "late_liquidity" = "policy",
  ): Promise<RateRecord[]> {
    const url = TCMB_URLS[rateType];
    if (!url) {
      throw new Error(`Invalid rateType: ${rateType}`);
    }
    return this.fetchAndParseTable(url);
  }
}

let _tcmbProvider: TCMBRatesProvider | null = null;

export function getTCMBRatesProvider(): TCMBRatesProvider {
  if (!_tcmbProvider) {
    _tcmbProvider = new TCMBRatesProvider();
  }
  return _tcmbProvider;
}
