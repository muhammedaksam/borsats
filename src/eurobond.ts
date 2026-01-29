import * as cheerio from "cheerio";

import { APIError } from "~/exceptions";
import { BaseProvider } from "~/providers/base";
import { TTL } from "~/utils/helpers";

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
}
