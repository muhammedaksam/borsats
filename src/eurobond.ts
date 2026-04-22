import * as cheerio from "cheerio";

import { APIError } from "~/exceptions";
import { BaseProvider } from "~/providers/base";
import {
  EurobondHistoryRow,
  getEurobondProvider as getZiraatProvider,
} from "~/providers/ziraat-eurobond";
import { TTL } from "~/utils/helpers";

export type { EurobondHistoryRow } from "~/providers/ziraat-eurobond";

const PERIOD_DAYS: Record<string, number | null> = {
  "1mo": 30,
  "3mo": 90,
  "6mo": 180,
  "1y": 365,
  "2y": 365 * 2,
  "3y": 365 * 3,
  "5y": 365 * 5,
  "10y": 365 * 10,
  ytd: null, // handled separately
  max: 365 * 15,
};

/**
 * Parse start/end argument (accepts string YYYY-MM-DD, DD.MM.YYYY, DD-MM-YYYY, DD/MM/YYYY, YYYY/MM/DD, or Date).
 */
function parseDateArg(value: string | Date): Date {
  if (value instanceof Date) return value;

  // YYYY-MM-DD
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
  }

  // YYYY/MM/DD
  const slash = value.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (slash) {
    return new Date(
      parseInt(slash[1]),
      parseInt(slash[2]) - 1,
      parseInt(slash[3]),
    );
  }

  // DD.MM.YYYY (Turkish dotted)
  const dotted = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dotted) {
    return new Date(
      parseInt(dotted[3]),
      parseInt(dotted[2]) - 1,
      parseInt(dotted[1]),
    );
  }

  // DD-MM-YYYY
  const dashed = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dashed) {
    return new Date(
      parseInt(dashed[3]),
      parseInt(dashed[2]) - 1,
      parseInt(dashed[1]),
    );
  }

  // DD/MM/YYYY
  const slashedDMY = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashedDMY) {
    return new Date(
      parseInt(slashedDMY[3]),
      parseInt(slashedDMY[2]) - 1,
      parseInt(slashedDMY[1]),
    );
  }

  throw new Error(`Could not parse date: ${value}`);
}

// Ziraat Bank Eurobond API endpoint
const ZIRAAT_URL =
  "https://www.ziraatbank.com.tr/tr/_layouts/15/Ziraat/FaizOranlari/Ajax.aspx/GetZBBonoTahvilOran";

export interface EurobondData {
  isin: string;
  maturity: Date | null;
  daysToMaturity: number;
  currency: string;
  bidPrice: number | null;
  bidYield: number | null;
  askPrice: number | null;
  askYield: number | null;
}

export class ZiraatEurobondProvider extends BaseProvider {
  constructor() {
    super({
      baseUrl: "https://www.ziraatbank.com.tr",
    });
  }

  private _parseTurkishNumber(text: string): number | null {
    const cleaned = text.trim();
    if (!cleaned || cleaned === "-") {
      return null;
    }
    try {
      return parseFloat(cleaned.replace(",", "."));
    } catch {
      return null;
    }
  }

  private _parseDate(text: string): Date | null {
    try {
      const cleaned = text.trim();
      if (!cleaned) return null;

      // Format: DD.MM.YYYY
      const parts = cleaned.split(".");
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day);
      }
    } catch {
      return null;
    }
    return null;
  }

  /**
   * Get all Turkish Eurobonds.
   *
   * @param currency Optional filter by currency ("USD" or "EUR")
   * @returns List of Eurobond data
   */
  async getEurobonds(currency?: string): Promise<EurobondData[]> {
    const cacheKey = "ziraat_eurobonds";
    let cached = this.cache.get(cacheKey) as EurobondData[] | undefined;

    if (!cached) {
      const headers = {
        "Content-Type": "application/json",
        Accept: "application/json",
        Origin: "https://www.ziraatbank.com.tr",
        Referer: "https://www.ziraatbank.com.tr/tr/bireysel/yatirim/eurobond",
      };

      const payload = {
        kiymetTipi: "EURO",
        date: new Date().toISOString().split("T")[0],
        hideIfStartWith: "",
      };

      try {
        const response = await this.client.post(ZIRAAT_URL, payload, {
          headers,
        });

        const data = response.data as { d?: { Data?: string } };
        const html = data.d?.Data || "";
        if (!html) {
          return [];
        }

        // Parse HTML table
        const $ = cheerio.load(html);
        const table = $("table").first();
        if (!table.length) {
          return [];
        }

        const bonds: EurobondData[] = [];
        const rows = table.find("tr");

        rows.each((i, row) => {
          if (i === 0) return; // Skip header

          const cols = $(row).find("td");
          if (cols.length < 8) return;

          const daysText = $(cols[2]).text().trim();
          const daysToMaturity =
            daysText && !isNaN(Number(daysText)) ? parseInt(daysText, 10) : 0;

          bonds.push({
            isin: $(cols[0]).text().trim(),
            maturity: this._parseDate($(cols[1]).text()),
            daysToMaturity,
            currency: $(cols[3]).text().trim(),
            bidPrice: this._parseTurkishNumber($(cols[4]).text()),
            bidYield: this._parseTurkishNumber($(cols[5]).text()),
            askPrice: this._parseTurkishNumber($(cols[6]).text()),
            askYield: this._parseTurkishNumber($(cols[7]).text()),
          });
        });

        this.cache.set(cacheKey, bonds, TTL.FX_RATES); // 5 minutes
        cached = bonds;
      } catch (e) {
        throw new APIError(
          `Failed to fetch Eurobonds: ${(e as Error).message}`,
        );
      }
    }

    // Apply currency filter if specified
    if (currency) {
      const upperCurrency = currency.toUpperCase();
      return cached.filter((b) => b.currency === upperCurrency);
    }

    return cached;
  }

  /**
   * Get single Eurobond by ISIN.
   *
   * @param isin ISIN code (e.g., "US900123DG28")
   * @returns Eurobond data or null if not found
   */
  async getEurobond(isin: string): Promise<EurobondData | null> {
    const upperIsin = isin.toUpperCase();
    const bonds = await this.getEurobonds();

    return bonds.find((bond) => bond.isin === upperIsin) || null;
  }
}

// Singleton
let provider: ZiraatEurobondProvider | null = null;

export function getEurobondProvider(): ZiraatEurobondProvider {
  if (!provider) {
    provider = new ZiraatEurobondProvider();
  }
  return provider;
}

/**
 * Get eurobond data (convenience function)
 */
export async function eurobonds(currency?: string): Promise<EurobondData[]> {
  return getEurobondProvider().getEurobonds(currency);
}

/**
 * Eurobond class for individual bond queries
 */
export class Eurobond {
  public readonly isin: string;

  constructor(isin: string) {
    this.isin = isin;
  }

  /**
   * Maturity date of the bond
   */
  async maturity(): Promise<Date | null> {
    const bond = await this.getData();
    return bond?.maturity || null;
  }

  /**
   * Days until maturity
   */
  async daysToMaturity(): Promise<number> {
    const bond = await this.getData();
    return bond?.daysToMaturity || 0;
  }

  /**
   * Bond currency (USD or EUR)
   */
  async currency(): Promise<string> {
    const bond = await this.getData();
    return bond?.currency || "";
  }

  /**
   * Bid price (buying price)
   */
  async bidPrice(): Promise<number | null> {
    const bond = await this.getData();
    return bond?.bidPrice || null;
  }

  /**
   * Bid yield (buying yield) as percentage
   */
  async bidYield(): Promise<number | null> {
    const bond = await this.getData();
    return bond?.bidYield || null;
  }

  /**
   * Alias for bidYield
   */
  async yieldRate(): Promise<number | null> {
    const val = await this.bidYield();
    return val === null ? 0 : val;
  }

  /**
   * Ask price (selling price)
   */
  async askPrice(): Promise<number | null> {
    const bond = await this.getData();
    return bond?.askPrice || null;
  }

  /**
   * Ask yield (selling yield) as percentage
   */
  async askYield(): Promise<number | null> {
    const bond = await this.getData();
    return bond?.askYield || null;
  }

  /**
   * Get full bond data
   */
  async getData(): Promise<EurobondData | null> {
    return getEurobondProvider().getEurobond(this.isin);
  }

  /**
   * Alias for getData
   */
  async info(): Promise<EurobondData | null> {
    return this.getData();
  }

  /**
   * Fetch daily historical bid/ask prices and yields.
   *
   * @param options.period - Lookback window ending today. One of 1mo, 3mo, 6mo, 1y, 2y, 3y, 5y, 10y, ytd, max.
   *                         Ignored if `start` is given.
   * @param options.start - Start date (string "YYYY-MM-DD" or Date).
   * @param options.end - End date, defaults to today.
   * @param options.skipWeekends - Skip Sat/Sun (API returns zeros on weekends). Default true.
   * @returns Array of EurobondHistoryRow sorted by date ascending.
   *          Holidays and suspended trading days (bidPrice == 0) are dropped.
   */
  async history(
    options: {
      period?: string;
      start?: string | Date;
      end?: string | Date;
      skipWeekends?: boolean;
    } = {},
  ): Promise<EurobondHistoryRow[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Resolve end
    const endD = options.end ? parseDateArg(options.end) : today;

    // Resolve start
    let startD: Date;
    if (options.start) {
      startD = parseDateArg(options.start);
    } else if (options.period) {
      const period = options.period;
      if (period === "ytd") {
        startD = new Date(today.getFullYear(), 0, 1);
      } else if (period in PERIOD_DAYS && PERIOD_DAYS[period] !== null) {
        startD = new Date(endD);
        startD.setDate(startD.getDate() - PERIOD_DAYS[period]!);
      } else {
        throw new Error(
          `Unknown period ${JSON.stringify(period)}. Use start= or one of: ` +
            Object.keys(PERIOD_DAYS).sort().join(", "),
        );
      }
    } else {
      // Default to 1 month
      startD = new Date(endD);
      startD.setDate(startD.getDate() - 30);
    }

    const provider = getZiraatProvider();
    return provider.getHistory(
      this.isin,
      startD,
      endD,
      options.skipWeekends !== false,
    );
  }
}
