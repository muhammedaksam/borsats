import * as cheerio from "cheerio";

import { APIError } from "~/exceptions";
import { BaseProvider } from "~/providers/base";

export interface KAPCompany {
  ticker: string;
  name: string;
  city: string;
}

export interface Disclosure {
  date: Date;
  title: string;
  url: string;
  disclosureIndex: number;
}

export interface ExpectedDisclosure {
  startDate: string;
  endDate: string;
  subject: string;
  period: string;
  year: string;
}

export interface KAPCompanyDetails {
  sector?: string;
  market?: string;
  website?: string;
  businessSummary?: string;
}

export class KAPProvider extends BaseProvider {
  // URLs
  private static readonly BIST_COMPANIES_URL =
    "https://www.kap.org.tr/tr/bist-sirketler";
  private static readonly DISCLOSURE_URL =
    "https://www.kap.org.tr/tr/bildirim-sorgu-sonuc";
  private static readonly CALENDAR_API_URL =
    "https://kap.org.tr/tr/api/expected-disclosure-inquiry/company";
  private static readonly COMPANY_INFO_URL =
    "https://kap.org.tr/tr/sirket-bilgileri/ozet";
  private static readonly COMPANY_GENERAL_URL =
    "https://kap.org.tr/tr/sirket-bilgileri/genel";

  // Caches
  private companyCache: KAPCompany[] | null = null;
  private oidMap: Record<string, string> | null = null;
  private companyDetailsCache: Map<string, KAPCompanyDetails> = new Map();

  constructor() {
    super({
      baseUrl: "https://www.kap.org.tr",
    });
  }

  /**
   * Get list of all BIST companies.
   */
  async getCompanies(): Promise<KAPCompany[]> {
    if (this.companyCache) {
      return this.companyCache;
    }

    // Since we don't have xlsx support, we scrape the BIST companies page
    // The page contains all companies in Next.js data or similar structure
    try {
      const response = await this.client.get(KAPProvider.BIST_COMPANIES_URL, {
        headers: {
          Accept: "*/*",
          "Accept-Language": "tr",
          Referer: "https://www.kap.org.tr/tr/bist-sirketler",
        },
      });

      const companies: KAPCompany[] = [];
      const html = response.data as string;
      const pattern =
        /\\"mkkMemberOid\\":\\"([^\\"]+)\\",\\"kapMemberTitle\\":\\"([^\\"]+)\\",\\"relatedMemberTitle\\":\\"[^\\"]*\\",\\"stockCode\\":\\"([^\\"]+)\\"/g;

      let match;
      while ((match = pattern.exec(html)) !== null) {
        const _oid = match[1];
        const name = match[2];
        const codesStr = match[3];

        // stockCode can be "GARAN, TGB"
        const codes = codesStr
          .split(",")
          .map((c) => c.trim())
          .filter((c) => c);

        for (const code of codes) {
          companies.push({
            ticker: code,
            name: name,
            city: "", // Metadata not easily available in JSON dump regex
          });
        }
      }

      this.companyCache = companies;
      return companies;
    } catch (e) {
      throw new APIError(
        `Failed to fetch company list: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Search companies by name or ticker.
   */
  async search(query: string): Promise<KAPCompany[]> {
    if (!query) return [];

    const companies = await this.getCompanies();
    const queryNorm = this._normalizeText(query);
    const queryUpper = query.toUpperCase();

    const results: Array<{ score: number; company: KAPCompany }> = [];

    for (const company of companies) {
      let score = 0;
      const ticker = company.ticker;
      const name = company.name;
      const nameNorm = this._normalizeText(name);

      if (ticker === queryUpper) {
        score = 1000;
      } else if (ticker.startsWith(queryUpper)) {
        score = 500;
      } else if (nameNorm.includes(queryNorm)) {
        score = 100;
      }

      if (score > 0) {
        results.push({ score, company });
      }
    }

    return results.sort((a, b) => b.score - a.score).map((r) => r.company);
  }

  /**
   * Get KAP member OID (mkkMemberOid) for a stock symbol.
   */
  async getMemberOid(symbol: string): Promise<string | null> {
    const cleanSymbol = symbol
      .toUpperCase()
      .replace(".IS", "")
      .replace(".E", "");

    if (this.oidMap && this.oidMap[cleanSymbol]) {
      return this.oidMap[cleanSymbol];
    }

    // Refresh map
    await this.getCompanies();

    try {
      const response = await this.client.get(KAPProvider.BIST_COMPANIES_URL, {
        timeout: 20000,
      });
      const html = response.data as string;

      const pattern =
        /\\"mkkMemberOid\\":\\"([^\\"]+)\\",\\"kapMemberTitle\\":\\"([^\\"]+)\\",\\"relatedMemberTitle\\":\\"[^\\"]*\\",\\"stockCode\\":\\"([^\\"]+)\\"/g;

      this.oidMap = {};
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const oid = match[1];
        const codesStr = match[3];
        const codes = codesStr
          .split(",")
          .map((c) => c.trim())
          .filter((c) => c);
        for (const code of codes) {
          this.oidMap[code] = oid;
        }
      }

      return this.oidMap[cleanSymbol] || null;
    } catch {
      return null;
    }
  }

  /**
   * Get KAP disclosures (bildirimler) for a stock.
   */
  async getDisclosures(
    symbol: string,
    limit: number = 20,
  ): Promise<Disclosure[]> {
    const cleanSymbol = symbol
      .toUpperCase()
      .replace(".IS", "")
      .replace(".E", "");
    const oid = await this.getMemberOid(cleanSymbol);

    if (!oid) return [];

    const url = `${KAPProvider.DISCLOSURE_URL}?member=${oid}`;

    try {
      const response = await this.client.get(url, { timeout: 15000 });
      const html = response.data as string;

      // Regex: publishDate\\":\\"([^\\"]+)\\".*?disclosureIndex\\":(\d+).*?title\\":\\"([^\\"]+)\\"
      const pattern =
        /publishDate\\":\\"([^\\"]+)\\".*?disclosureIndex\\":(\d+).*?title\\":\\"([^\\"]+)\\"/gs;

      const records: Disclosure[] = [];
      let match;
      while ((match = pattern.exec(html)) !== null) {
        if (records.length >= limit) break;

        const dateStr = match[1]; // 29.12.2025 19:21:18
        const idx = Number(match[2]);
        const title = match[3];

        // Parse date DD.MM.YYYY HH:mm:ss
        const [dPart, tPart] = dateStr.split(" ");
        const [day, month, year] = dPart.split(".");
        const [hour, min, sec] = tPart.split(":");

        const date = new Date(
          Number(year),
          Number(month) - 1,
          Number(day),
          Number(hour),
          Number(min),
          Number(sec),
        );

        records.push({
          date,
          title,
          url: `https://www.kap.org.tr/tr/Bildirim/${idx}`,
          disclosureIndex: idx,
        });
      }

      return records;
    } catch (e) {
      throw new APIError(
        `Failed to fetch disclosures for ${cleanSymbol}: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Get expected disclosure calendar for a stock.
   */
  async getCalendar(symbol: string): Promise<ExpectedDisclosure[]> {
    const cleanSymbol = symbol
      .toUpperCase()
      .replace(".IS", "")
      .replace(".E", "");
    const oid = await this.getMemberOid(cleanSymbol);

    if (!oid) return [];

    const now = new Date();
    const startDate = this._formatDateISO(now);
    const endDate = this._formatDateISO(
      new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000),
    ); // 6 months

    const headers = {
      Accept: "*/*",
      "Content-Type": "application/json",
      Origin: "https://kap.org.tr",
      Referer: "https://kap.org.tr/tr/beklenen-bildirim-sorgu",
    };

    const payload = {
      startDate,
      endDate,
      memberTypes: ["IGS"],
      mkkMemberOidList: [oid],
      disclosureClass: "",
      subjects: [],
      mainSector: "",
      sector: "",
      subSector: "",
      market: "",
      index: "",
      year: "",
      term: "",
      ruleType: "",
    };

    try {
      const response = await this.client.post(
        KAPProvider.CALENDAR_API_URL,
        payload,
        {
          headers,
          timeout: 15000,
        },
      );

      interface KAPCalendarItem {
        startDate?: string;
        endDate?: string;
        subject?: string;
        ruleTypeTerm?: string;
        year?: string;
      }

      const data = response.data as KAPCalendarItem[];

      return data.map((item) => ({
        startDate: item.startDate || "",
        endDate: item.endDate || "",
        subject: item.subject || "",
        period: item.ruleTypeTerm || "",
        year: item.year || "",
      }));
    } catch (e) {
      throw new APIError(
        `Failed to fetch calendar for ${cleanSymbol}: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Get company details from KAP company info page.
   */
  async getCompanyDetails(symbol: string): Promise<KAPCompanyDetails> {
    const cleanSymbol = symbol
      .toUpperCase()
      .replace(".IS", "")
      .replace(".E", "");

    if (this.companyDetailsCache.has(cleanSymbol)) {
      return this.companyDetailsCache.get(cleanSymbol)!;
    }

    const oid = await this.getMemberOid(cleanSymbol);
    if (!oid) return {};

    const url = `${KAPProvider.COMPANY_INFO_URL}/${oid}`;

    try {
      const response = await this.client.get(url, { timeout: 15000 });
      const html = response.data as string;
      const $ = cheerio.load(html);

      const result: KAPCompanyDetails = {};

      // Sector: href="/tr/Sektorler?sector=..."
      const sectorLink = $('a[href^="/tr/Sektorler?sector="]').first();
      if (sectorLink.length) {
        result.sector = sectorLink.text().trim();
      }

      // Market: href="/tr/Pazarlar?market=..."
      const marketLink = $('a[href^="/tr/Pazarlar?market="]').first();
      if (marketLink.length) {
        result.market = marketLink.text().trim();
      }

      // Website
      // Check for headers like "İnternet Adresi"
      // Usually h3 or similar
      const websiteLabel = $('h3:contains("İnternet Adresi")');
      if (websiteLabel.length) {
        result.website = websiteLabel.next("p").text().trim();
      }

      // Business Summary
      const summary = await this._getBusinessSummary(oid);
      if (summary) {
        result.businessSummary = summary;
      }

      this.companyDetailsCache.set(cleanSymbol, result);
      return result;
    } catch {
      return {};
    }
  }

  /**
   * Get disclosure HTML content by ID.
   */
  async getDisclosureContent(
    disclosureId: string | number,
  ): Promise<string | null> {
    const url = `https://www.kap.org.tr/tr/Bildirim/${disclosureId}`;
    try {
      const response = await this.client.get(url, { timeout: 15000 });
      return response.data;
    } catch {
      return null;
    }
  }

  // Helpers

  private async _getBusinessSummary(oid: string): Promise<string | null> {
    const url = `${KAPProvider.COMPANY_GENERAL_URL}/${oid}`;
    try {
      const response = await this.client.get(url, { timeout: 15000 });
      const html = response.data as string;

      // Use logic similar to Python but maybe simpler with cheerio if possible?
      // Python extracts JSON chunks. KAP general page is React/Next.js dynamic.
      // The content might be in a JSON blob.

      // Try verify keywords like "kpy41_acc2_faaliyet_konu"
      if (!html.includes("kpy41_acc2_faaliyet_konu")) return null;

      // Attempt to extract text using simpler regex if strictly needed
      // Python's regex is quite robust for this mess.

      // Let's use Cheerio to find the text if it's rendered.
      // KAP usually renders this in Client Side BUT for SEO it might be in HTML.
      // If it's in regex patterns, it means it's in JSON string variables.

      // Let's try matching the Python regex pattern for value
      const keyIdx = html.indexOf("kpy41_acc2_faaliyet_konu");
      if (keyIdx < 0) return null;

      const chunk = html.substring(keyIdx, keyIdx + 5000); // look ahead
      const valueMatch = /value\\":\\"(.*?)\\",\\"disclosureIndex/.exec(chunk);

      if (valueMatch) {
        let val = valueMatch[1];
        // Decode unicode
        val = JSON.parse(`"${val}"`); // handles unicode escapes
        // Remove HTML tags
        val = val.replace(/<[^>]*>/g, " ");
        val = val.replace(/\s+/g, " ").trim();
        return val.length > 10 ? val : null;
      }

      return null;
    } catch {
      return null;
    }
  }

  private _normalizeText(text: string): string {
    const trMap: Record<string, string> = {
      İ: "i",
      I: "i",
      ı: "i",
      Ö: "o",
      ö: "o",
      Ü: "u",
      ü: "u",
      Ş: "s",
      ş: "s",
      Ç: "c",
      ç: "c",
      Ğ: "g",
      ğ: "g",
    };

    let normalized = text
      .split("")
      .map((char) => trMap[char] || char)
      .join("")
      .toLowerCase();

    // Remove common suffixes
    normalized = normalized.replace(/[\.,']|\s+a\.s\.?|\s+anonim sirketi/g, "");
    return normalized.trim();
  }

  private _formatDateISO(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
}

// Singleton
let provider: KAPProvider | null = null;
export function getKAPProvider(): KAPProvider {
  if (!provider) {
    provider = new KAPProvider();
  }
  return provider;
}
