import * as cheerio from "cheerio";

import { APIError, DataNotAvailableError } from "~/exceptions";
import { BaseProvider } from "~/providers/base";
import { TTL } from "~/utils/helpers";

export interface BondData {
  name: string;
  maturity: string | null;
  yield: number | null;
  yieldDecimal: number | null;
  change: number | null;
  changePct: number | null;
  url: string;
}

export class DovizcomTahvilProvider extends BaseProvider {
  private static readonly BASE_URL = "https://www.doviz.com/tahvil";

  private static readonly MATURITY_MAP: Record<string, string[]> = {
    "2Y": ["2 Yıllık", "2 yıllık", "2-yillik"],
    "5Y": ["5 Yıllık", "5 yıllık", "5-yillik"],
    "10Y": ["10 Yıllık", "10 yıllık", "10-yillik"],
  };

  constructor() {
    super({
      baseUrl: "https://www.doviz.com",
    });
  }

  private _parseFloat(text: string): number | null {
    try {
      const cleaned = text.trim().replace(",", ".").replace("%", "");
      return parseFloat(cleaned);
    } catch {
      return null;
    }
  }

  private _getMaturity(name: string): string | null {
    for (const [maturity, patterns] of Object.entries(
      DovizcomTahvilProvider.MATURITY_MAP,
    )) {
      if (patterns.some((p) => name.includes(p))) {
        return maturity;
      }
    }
    return null;
  }

  /**
   * Get current Turkish government bond yields.
   *
   * @returns List of bond data with name, maturity, yield, change, etc.
   */
  async getBondYields(): Promise<BondData[]> {
    const cacheKey = "dovizcom:tahvil:all";
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as BondData[];
    }

    try {
      const response = await this.client.get(DovizcomTahvilProvider.BASE_URL);
      const html = response.data as string;
      const $ = cheerio.load(html);

      // Find the commodities table
      const table = $("#commodities");
      if (!table.length) {
        throw new DataNotAvailableError("Bond table not found on page");
      }

      const tbody = table.find("tbody");
      if (!tbody.length) {
        throw new DataNotAvailableError("Bond data not found");
      }

      const bonds: BondData[] = [];

      tbody.find("tr").each((_, row) => {
        try {
          const cells = $(row).find("td");
          if (cells.length < 3) {
            return;
          }

          // Parse bond name and URL
          const nameLink = cells.eq(0).find("a.name");
          if (!nameLink.length) {
            return;
          }

          const name = nameLink.text().trim();
          const url = nameLink.attr("href") || "";

          // Parse current yield
          const yieldText = cells.eq(1).text().trim();
          const yieldRate = this._parseFloat(yieldText);

          // Parse change percentage
          const changeText = cells.eq(2).text().trim();
          const changePct = this._parseFloat(changeText);

          // Get maturity
          const maturity = this._getMaturity(name);

          const bondData: BondData = {
            name,
            maturity,
            yield: yieldRate,
            yieldDecimal: yieldRate ? yieldRate / 100 : null,
            change:
              yieldRate && changePct ? yieldRate * (changePct / 100) : null,
            changePct,
            url,
          };

          bonds.push(bondData);
        } catch {
          // Skip malformed rows
        }
      });

      if (bonds.length === 0) {
        throw new DataNotAvailableError("No bond data found");
      }

      this.cache.set(cacheKey, bonds, TTL.FX_RATES);
      return bonds;
    } catch (e) {
      if (e instanceof DataNotAvailableError || e instanceof APIError) {
        throw e;
      }
      throw new APIError(
        `Failed to fetch bond yields: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Get a specific bond by maturity.
   *
   * @param maturity Bond maturity (2Y, 5Y, 10Y)
   * @returns Bond data
   */
  async getBond(maturity: string): Promise<BondData> {
    const upperMaturity = maturity.toUpperCase();
    const bonds = await this.getBondYields();

    const bond = bonds.find((b) => b.maturity === upperMaturity);
    if (!bond) {
      throw new DataNotAvailableError(
        `Bond with maturity ${upperMaturity} not found`,
      );
    }

    return bond;
  }

  /**
   * Get current 10-year Turkish government bond yield as decimal.
   * Useful for DCF calculations.
   *
   * @returns 10Y bond yield as decimal (e.g., 0.28 for 28%)
   */
  async get10YYield(): Promise<number | null> {
    try {
      const bond = await this.getBond("10Y");
      return bond.yieldDecimal;
    } catch (e) {
      if (e instanceof DataNotAvailableError) {
        return null;
      }
      throw e;
    }
  }
}

// Singleton
let provider: DovizcomTahvilProvider | null = null;

export function getTahvilProvider(): DovizcomTahvilProvider {
  if (!provider) {
    provider = new DovizcomTahvilProvider();
  }
  return provider;
}
