import * as cheerio from "cheerio";

import { APIError, DataNotAvailableError } from "~/exceptions";
import { BaseProvider } from "~/providers/base";
import { TTL } from "~/utils/helpers";

export interface InflationData {
  date: Date;
  yearMonth: string;
  yearlyInflation: number;
  monthlyInflation: number;
}

export interface InflationCalculation {
  startDate: string;
  endDate: string;
  initialValue: number;
  finalValue: number;
  totalYears: number;
  totalMonths: number;
  totalChange: number;
  avgYearlyInflation: number;
  startCPI: number;
  endCPI: number;
}

export interface InterestRateData {
  date: Date | null;
  borrowing: number | null;
  lending: number | null;
}

export interface InterestRateRecord extends InterestRateData {
  rateType: "policy" | "overnight" | "late_liquidity";
}

export class TCMBProvider extends BaseProvider {
  private static readonly BASE_URL = "https://www.tcmb.gov.tr";
  private static readonly CALC_API_URL =
    "https://appg.tcmb.gov.tr/KIMENFH/enflasyon/hesapla";

  private static readonly INFLATION_PATHS: Record<string, string> = {
    tufe: "/wps/wcm/connect/tr/tcmb+tr/main+menu/istatistikler/enflasyon+verileri",
    ufe: "/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Istatistikler/Enflasyon+Verileri/Uretici+Fiyatlari",
  };

  constructor() {
    super({
      baseUrl: "https://www.tcmb.gov.tr",
    });
  }

  /**
   * Calculate inflation between two dates using TCMB API.
   */
  async calculateInflation(
    startYear: number,
    startMonth: number,
    endYear: number,
    endMonth: number,
    basketValue: number = 100.0,
  ): Promise<InflationCalculation> {
    // Validate inputs
    const now = new Date();
    if (startYear < 1982 || startYear > now.getFullYear()) {
      throw new Error(
        `Start year must be between 1982 and ${now.getFullYear()}`,
      );
    }
    if (endYear < 1982 || endYear > now.getFullYear()) {
      throw new Error(`End year must be between 1982 and ${now.getFullYear()}`);
    }
    if (startMonth < 1 || startMonth > 12 || endMonth < 1 || endMonth > 12) {
      throw new Error("Month must be between 1 and 12");
    }
    if (basketValue <= 0) {
      throw new Error("Basket value must be positive");
    }

    const startDate = new Date(startYear, startMonth - 1, 1);
    const endDate = new Date(endYear, endMonth - 1, 1);
    if (startDate >= endDate) {
      throw new Error("Start date must be before end date");
    }

    const headers = {
      Accept: "*/*",
      "Content-Type": "application/json",
      Origin: "https://herkesicin.tcmb.gov.tr",
      Referer: "https://herkesicin.tcmb.gov.tr/",
    };

    const payload = {
      baslangicYil: String(startYear),
      baslangicAy: String(startMonth),
      bitisYil: String(endYear),
      bitisAy: String(endMonth),
      malSepeti: String(basketValue),
    };

    try {
      const response = await this.client.post(
        TCMBProvider.CALC_API_URL,
        payload,
        {
          headers,
          timeout: 30000,
        },
      );
      const data = response.data;

      return {
        startDate: `${startYear}-${String(startMonth).padStart(2, "0")}`,
        endDate: `${endYear}-${String(endMonth).padStart(2, "0")}`,
        initialValue: basketValue,
        finalValue: this._parseFloat(data.yeniSepetDeger),
        totalYears: Number(data.toplamYil || 0),
        totalMonths: Number(data.toplamAy || 0),
        totalChange: this._parseFloat(data.toplamDegisim),
        avgYearlyInflation: this._parseFloat(data.ortalamaYillikEnflasyon),
        startCPI: this._parseFloat(data.ilkYilTufe),
        endCPI: this._parseFloat(data.sonYilTufe),
      };
    } catch (e) {
      throw new APIError(
        `Failed to calculate inflation: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Get inflation data from TCMB website.
   */
  async getData(
    inflationType: "tufe" | "ufe" = "tufe",
    options: {
      start?: string | Date;
      end?: string | Date;
      limit?: number;
    } = {},
  ): Promise<InflationData[]> {
    const { start, end, limit } = options;
    if (!TCMBProvider.INFLATION_PATHS[inflationType]) {
      throw new Error(`Invalid type: ${inflationType}. Use 'tufe' or 'ufe'`);
    }

    const cacheKey = `tcmb:data:${inflationType}`;
    const cached = this.cache.get(cacheKey);
    let records: InflationData[] = [];

    if (cached) {
      records = cached as InflationData[];
    } else {
      const url =
        TCMBProvider.BASE_URL + TCMBProvider.INFLATION_PATHS[inflationType];
      const headers = {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "tr-TR,tr;q=0.9",
      };

      try {
        const response = await this.client.get(url, {
          headers,
          timeout: 30000,
        });
        const html = response.data as string;
        records = this._parseInflationTable(html);

        if (records.length === 0) {
          throw new DataNotAvailableError(
            `No data available for ${inflationType}`,
          );
        }

        this.cache.set(cacheKey, records, TTL.FX_RATES);
      } catch (e) {
        if (e instanceof DataNotAvailableError) throw e;
        throw new APIError(
          `Failed to fetch inflation data: ${(e as Error).message}`,
        );
      }
    }

    // Filter by date
    if (start || end) {
      const startDate = start ? new Date(start) : null;
      const endDate = end ? new Date(end) : null;

      records = records.filter((r) => {
        if (startDate && r.date < startDate) return false;
        if (endDate && r.date > endDate) return false;
        return true;
      });
    }

    return limit && limit > 0 ? records.slice(0, limit) : records;
  }

  /**
   * Get the latest inflation data point.
   */
  async getLatest(
    inflationType: "tufe" | "ufe" = "tufe",
  ): Promise<InflationData> {
    const data = await this.getData(inflationType, { limit: 1 });
    if (data.length === 0) {
      throw new DataNotAvailableError(`No data available for ${inflationType}`);
    }
    return data[0];
  }

  // --- Helpers ---

  private _parseInflationTable(html: string): InflationData[] {
    const $ = cheerio.load(html);
    const tables = $("table");
    const records: InflationData[] = [];

    tables.each((_, table) => {
      // Check headers
      const headerText = $(table).find("tr").first().text().toLowerCase();

      if (
        !headerText.includes("tüfe") &&
        !headerText.includes("üfe") &&
        !headerText.includes("enflasyon") &&
        !headerText.includes("yıllık")
      ) {
        return;
      }

      const rows = $(table).find("tr").slice(1);
      rows.each((_, row) => {
        const cells = $(row).find("td, th");
        const cellTexts: string[] = [];
        cells.each((_, cell) => {
          cellTexts.push($(cell).text().trim());
        });

        if (
          cellTexts.length === 0 ||
          !cellTexts[0] ||
          cellTexts[0].includes("ÜFE")
        )
          return;

        try {
          let dateStr = "";
          let yearlyStr = "";
          let monthlyStr = "";

          // Determine indices based on row length (heuristic from python)
          if (cellTexts.length >= 5) {
            // UFE format often wider
            dateStr = cellTexts[0];
            yearlyStr = cellTexts[2];
            monthlyStr = cellTexts.length > 4 ? cellTexts[4] : "";
          } else if (cellTexts.length >= 3) {
            // TUFE format
            dateStr = cellTexts[0];
            yearlyStr = cellTexts[1];
            monthlyStr = cellTexts[2];
          } else {
            return;
          }

          const date = this._parseDate(dateStr);
          const yearlyInflation = this._parsePercentage(yearlyStr);
          const monthlyInflation = this._parsePercentage(monthlyStr);

          if (date && yearlyInflation !== null && monthlyInflation !== null) {
            records.push({
              date,
              yearMonth: dateStr,
              yearlyInflation,
              monthlyInflation,
            });
          }
        } catch {
          // ignore row
        }
      });

      // If we found data in this table, stop? Python logic breaks after first valid table.
      if (records.length > 0) return false; // stop iteration
      return true;
    });

    return records.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  private _parseFloat(value: unknown): number {
    if (!value) return 0;

    const str = String(value);
    return parseFloat(str.replace(/,/g, "")) || 0;
  }

  private _parsePercentage(value: string): number | null {
    if (!value) return null;
    // Remove % and replace comma with dot (TR format)
    let str = value.replace(/%/g, "").replace(/,/g, ".").trim();
    // Remove non-numeric chars except dot and minus
    str = str.replace(/[^\d.-]/g, "");

    const num = parseFloat(str);
    return IsNaN(num) ? null : num;
  }

  private _parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    // Format: MM-YYYY
    const clean = dateStr.trim().replace(/[.,]/g, "");
    const match = clean.match(/(\d{1,2})-(\d{4})/);

    if (match) {
      const month = parseInt(match[1]);
      const year = parseInt(match[2]);
      if (!isNaN(month) && !isNaN(year)) {
        return new Date(year, month - 1, 1);
      }
    }
    return null;
  }

  // ===== Interest Rate Methods =====

  private static readonly INTEREST_RATE_URLS: Record<string, string> = {
    policy:
      "https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Temel+Faaliyetler/Para+Politikasi/Merkez+Bankasi+Faiz+Oranlari/1+Hafta+Repo",
    overnight:
      "https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Temel+Faaliyetler/Para+Politikasi/Merkez+Bankasi+Faiz+Oranlari/faiz-oranlari",
    late_liquidity:
      "https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Temel+Faaliyetler/Para+Politikasi/Merkez+Bankasi+Faiz+Oranlari/Gec+Likidite+Penceresi+%28LON%29",
  };

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

  private _parseInterestRateDate(dateStr: string): Date | null {
    try {
      const parts = dateStr.trim().split(".");
      if (parts.length === 3 && parts[2].length === 2) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = 2000 + parseInt(parts[2], 10);
        return new Date(year, month, day);
      }
      if (parts.length === 3 && parts[2].length === 4) {
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

  private async _fetchAndParseRateTable(
    url: string,
  ): Promise<InterestRateData[]> {
    const cacheKey = `tcmb_rates:${url}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as InterestRateData[];
    }

    try {
      const response = await this.client.get(url);
      const html = response.data as string;
      const $ = cheerio.load(html);

      const table = $("table").first();
      if (!table.length) {
        return [];
      }

      const results: InterestRateData[] = [];
      const rows = table.find("tr");

      rows.each((i, row) => {
        if (i === 0) return;

        const cols = $(row).find("td");
        if (cols.length < 3) return;

        const date = this._parseInterestRateDate($(cols[0]).text());
        const borrowing = this._parseTurkishNumber($(cols[1]).text());
        const lending = this._parseTurkishNumber($(cols[2]).text());

        if (date) {
          results.push({ date, borrowing, lending });
        }
      });

      this.cache.set(cacheKey, results, TTL.FX_RATES);
      return results;
    } catch {
      return [];
    }
  }

  /**
   * Get current 1-week repo rate (policy rate).
   */
  async getPolicyRate(): Promise<InterestRateData> {
    const data = await this._fetchAndParseRateTable(
      TCMBProvider.INTEREST_RATE_URLS.policy,
    );
    if (!data.length) {
      return { date: null, borrowing: null, lending: null };
    }

    return {
      date: data[0].date,
      borrowing: null,
      lending: data[0].lending,
    };
  }

  /**
   * Get overnight (O/N) corridor rates.
   */
  async getOvernightRates(): Promise<InterestRateData> {
    const data = await this._fetchAndParseRateTable(
      TCMBProvider.INTEREST_RATE_URLS.overnight,
    );
    return data.length
      ? data[0]
      : { date: null, borrowing: null, lending: null };
  }

  /**
   * Get late liquidity window (LON) rates.
   */
  async getLateLiquidityRates(): Promise<InterestRateData> {
    const data = await this._fetchAndParseRateTable(
      TCMBProvider.INTEREST_RATE_URLS.late_liquidity,
    );
    return data.length
      ? data[0]
      : { date: null, borrowing: null, lending: null };
  }

  /**
   * Get all current TCMB interest rates.
   */
  async getAllRates(): Promise<InterestRateRecord[]> {
    const [policy, overnight, lateLiquidity] = await Promise.all([
      this.getPolicyRate(),
      this.getOvernightRates(),
      this.getLateLiquidityRates(),
    ]);

    return [
      { ...policy, rateType: "policy" },
      { ...overnight, rateType: "overnight" },
      { ...lateLiquidity, rateType: "late_liquidity" },
    ];
  }

  /**
   * Get historical rates for given type.
   */
  async getRateHistory(
    rateType: "policy" | "overnight" | "late_liquidity" = "policy",
  ): Promise<InterestRateData[]> {
    const url = TCMBProvider.INTEREST_RATE_URLS[rateType];
    if (!url) {
      throw new APIError(`Invalid rate_type: ${rateType}`);
    }

    return this._fetchAndParseRateTable(url);
  }
}

// Helper to check NaN (since TS strict checks)
function IsNaN(n: number) {
  return typeof n !== "number" || isNaN(n);
}

// Singleton
let provider: TCMBProvider | null = null;
export function getTCMBProvider(): TCMBProvider {
  if (!provider) {
    provider = new TCMBProvider();
  }
  return provider;
}
