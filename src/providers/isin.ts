import { BaseProvider } from "@/providers/base";

import { getKAPProvider } from "./kap";

export class ISINProvider extends BaseProvider {
  private static readonly ISIN_API_URL =
    "https://www.isinturkiye.com.tr/v17/tvs/isin/portal/bff/tvs/isin/portal/public/isinListele";
  private static readonly COMPANY_LIST_URL =
    "https://www.isinturkiye.com.tr/v17/tvs/isin/portal/bff/tvs/isin/portal/public/isinSirketListe";
  private static readonly CACHE_DURATION = 86400 * 7; // 7 days
  private static readonly COMPANY_CACHE_DURATION = 86400; // 24 hours

  private isinCompanies: Array<{ srkKod?: string; srkAd?: string }> | null =
    null;
  private isinCompaniesTime = 0;

  constructor() {
    super({
      baseUrl: "https://www.isinturkiye.com.tr",
    });
  }

  /**
   * Get ISIN code for a stock symbol.
   * Uses 3-step lookup: KAP → fuzzy match → ISIN API
   *
   * @param symbol Stock symbol (e.g., "THYAO", "GARAN")
   * @returns ISIN code (e.g., "TRATHYAO91M5") or null if not found
   */
  async getISIN(symbol: string): Promise<string | null> {
    const cleanSymbol = symbol.toUpperCase().replace(/\.(IS|E)$/, "");

    // Check cache
    const cacheKey = `isin_${cleanSymbol}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as string;
    }

    try {
      // Step 1: Get company name from KAP
      const companyName = await this._getCompanyName(cleanSymbol);
      if (!companyName) {
        return null;
      }

      // Step 2: Find ihracKod by fuzzy matching
      const ihracKod = await this._findIhracKod(companyName);
      if (!ihracKod) {
        return null;
      }

      // Step 3: Get ISIN from ihracKod
      const isin = await this._getISINFromIhrac(ihracKod, cleanSymbol);
      if (isin) {
        this.cache.set(cacheKey, isin, ISINProvider.CACHE_DURATION);
        return isin;
      }

      return null;
    } catch {
      return null;
    }
  }

  private async _getCompanyName(symbol: string): Promise<string | null> {
    try {
      const kap = getKAPProvider();
      const companies = await kap.getCompanies();

      const company = companies.find(
        (c) => c.ticker.toUpperCase() === symbol.toUpperCase(),
      );
      return company ? company.name : null;
    } catch {
      return null;
    }
  }

  private async _getISINCompanies(): Promise<
    Array<{ srkKod?: string; srkAd?: string }>
  > {
    const currentTime = Date.now() / 1000;

    if (
      this.isinCompanies &&
      currentTime - this.isinCompaniesTime < ISINProvider.COMPANY_CACHE_DURATION
    ) {
      return this.isinCompanies;
    }

    try {
      const headers = {
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: "https://www.isinturkiye.com.tr",
        Referer:
          "https://www.isinturkiye.com.tr/v17/tvs/isin/portal/bff/index.html",
      };

      const response = await this.client.post(
        ISINProvider.COMPANY_LIST_URL,
        {},
        { headers, timeout: 30000 },
      );

      interface CompanyListResponse {
        resultList?: Array<{ srkKod?: string; srkAd?: string }>;
      }

      const data = response.data as CompanyListResponse;
      this.isinCompanies = data.resultList || [];
      this.isinCompaniesTime = currentTime;
      return this.isinCompanies;
    } catch {
      return [];
    }
  }

  private _normalizeText(text: string): string {
    let normalized = text.toUpperCase();
    const trMap: Record<string, string> = {
      İ: "I",
      Ş: "S",
      Ğ: "G",
      Ü: "U",
      Ö: "O",
      Ç: "C",
    };

    for (const [k, v] of Object.entries(trMap)) {
      normalized = normalized.replace(new RegExp(k, "g"), v);
    }

    return normalized.replace(/[.,\-'"\s]+/g, " ").trim();
  }

  private _extractKeywords(text: string): Set<string> {
    const normalized = this._normalizeText(text);
    const stopwords = new Set([
      "VE",
      "A",
      "AS",
      "AO",
      "TAS",
      "ANONIM",
      "SIRKETI",
      "SIRKET",
      "TURKIYE",
      "TURK",
      "HOLDING",
      "SANAYI",
      "TICARET",
    ]);

    return new Set(
      normalized.split(" ").filter((w) => !stopwords.has(w) && w.length > 2),
    );
  }

  private async _findIhracKod(companyName: string): Promise<string | null> {
    const companies = await this._getISINCompanies();
    if (companies.length === 0) {
      return null;
    }

    const companyKeywords = this._extractKeywords(companyName);
    if (companyKeywords.size === 0) {
      return null;
    }

    let bestMatch: string | null = null;
    let bestScore = 0;

    for (const c of companies) {
      const srkAd = c.srkAd || "";
      // Extract company name part (after "CODE - ")
      const srkName = srkAd.includes(" - ") ? srkAd.split(" - ")[1] : srkAd;
      const srkKeywords = this._extractKeywords(srkName);

      if (srkKeywords.size > 0) {
        const common = new Set(
          [...companyKeywords].filter((x) => srkKeywords.has(x)),
        );
        const score =
          common.size / Math.max(companyKeywords.size, srkKeywords.size);

        if (score > bestScore) {
          bestScore = score;
          bestMatch = c.srkKod || null;
        }
      }
    }

    // Return if score is good enough (>0.35)
    return bestScore > 0.35 ? bestMatch : null;
  }

  private async _getISINFromIhrac(
    ihracKod: string,
    symbol: string,
  ): Promise<string | null> {
    try {
      const headers = {
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: "https://www.isinturkiye.com.tr",
        Referer:
          "https://www.isinturkiye.com.tr/v17/tvs/isin/portal/bff/index.html",
      };

      const payload = {
        isinKod: "",
        ihracKod,
        kategori: "",
        menkulTurKod: "",
      };

      const response = await this.client.post(
        ISINProvider.ISIN_API_URL,
        payload,
        { headers, timeout: 15000 },
      );

      interface ISINResponse {
        resultList?: Array<{
          borsaKodu?: string;
          menkulTur?: string;
          isinKod?: string;
        }>;
      }

      const data = response.data as ISINResponse;

      // Find matching stock (PAY type with matching borsaKodu)
      for (const item of data.resultList || []) {
        const borsaKodu = (item.borsaKodu || "").split(" - ")[0].trim();
        const menkulTur = item.menkulTur || "";
        const isin = item.isinKod || "";

        if (
          borsaKodu === symbol &&
          (menkulTur.includes("PAY") || menkulTur.includes("Hisse"))
        ) {
          return isin;
        }
      }

      return null;
    } catch {
      return null;
    }
  }
}

// Singleton
let provider: ISINProvider | null = null;

export function getISINProvider(): ISINProvider {
  if (!provider) {
    provider = new ISINProvider();
  }
  return provider;
}
