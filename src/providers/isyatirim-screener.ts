import * as cheerio from "cheerio";

import { APIError } from "~/exceptions";
import { BaseProvider } from "~/providers/base";
import { ScreenerCriteria, ScreenerResult } from "~/types";
import { TTL } from "~/utils/helpers";

// API Response Types
interface IsYatirimCriteriaResponse {
  value: Array<{
    KriterTanim?: string;
    KriterTanim_x003a_Ba_x015f_l_x01?: string;
    KriterTanim_x003a_MIN_DEGER?: string;
    KriterTanim_x003a_MAX_DEGER?: string;
  }>;
}

interface IsYatirimScreenerData {
  Hisse?: string;
  [key: string]: string | number | undefined;
}

interface IsYatirimScreenerResponse {
  d?: string; // JSON string containing array of IsYatirimScreenerData
}

export class IsYatirimScreenerProvider extends BaseProvider {
  private static readonly BASE_URL = "https://www.isyatirim.com.tr";
  private static readonly PAGE_URL = `${IsYatirimScreenerProvider.BASE_URL}/tr-tr/analiz/hisse/Sayfalar/gelismis-hisse-arama.aspx`;
  private static readonly SCREENER_URL = `${IsYatirimScreenerProvider.BASE_URL}/tr-tr/analiz/_Layouts/15/IsYatirim.Website/StockInfo/CompanyInfoAjax.aspx/getScreenerDataNEW`;
  private static readonly CRITERIA_URL = `${IsYatirimScreenerProvider.BASE_URL}/_layouts/15/IsYatirim.Website/Common/Data.aspx/StockScreenerGenelKriterler`;

  private cookies: string = "";
  private requestDigest: string | null = null;
  private sessionInitialized = false;

  private criteriaCache: ScreenerCriteria[] | null = null;
  private sectorsCache: Array<{ id: string; name: string }> | null = null;
  private indicesCache: Array<{ id: string; name: string }> | null = null;

  // Pre-defined templates with actual working criteria
  // Note: API requires criteria with both min AND max values to work
  // Market cap in TL (ID 8): roughly $1B = 43B TL, $5B = 215B TL (at ~43 TL/USD)
  public static readonly TEMPLATES: Record<
    string,
    { criteria?: Array<[string, string, string, string]>; oneri?: string }
  > = {
    small_cap: {
      criteria: [["8", "0", "43000", "False"]], // Market cap < ~$1B (43B TL)
    },
    mid_cap: {
      criteria: [["8", "43000", "215000", "False"]], // Market cap $1B-$5B
    },
    large_cap: {
      criteria: [["8", "215000", "5000000", "False"]], // Market cap > $5B
    },
    high_dividend: {
      criteria: [["33", "2", "100", "False"]], // Dividend yield > 2%
    },
    high_upside: {
      criteria: [["61", "0", "200", "False"]], // Positive upside potential
    },
    low_upside: {
      criteria: [["61", "-100", "0", "False"]], // Negative upside
    },
    high_volume: {
      criteria: [["26", "1", "1000", "False"]], // 3M avg volume > $1M
    },
    low_volume: {
      criteria: [["26", "0", "0.5", "False"]], // 3M avg volume < $0.5M
    },
    buy_recommendation: {
      criteria: [["7", "1", "50000", "False"]],
      oneri: "AL",
    },
    sell_recommendation: {
      criteria: [["7", "1", "50000", "False"]],
      oneri: "SAT",
    },
    high_net_margin: {
      criteria: [["119", "10", "200", "False"]], // Net margin > 10%
    },
    high_return: {
      criteria: [["22", "0", "100", "False"]], // Positive 1-week relative return
    },
    low_pe: {
      criteria: [["28", "0", "10", "False"]], // P/E < 10
    },
    high_roe: {
      criteria: [["422", "15", "200", "False"]], // ROE > 15%
    },
    high_foreign_ownership: {
      criteria: [["40", "30", "100", "False"]], // Foreign ownership > 30%
    },
  };

  constructor() {
    super({
      baseUrl: IsYatirimScreenerProvider.BASE_URL,
    });
  }

  /**
   * Initialize session by fetching the main page to get cookies.
   */
  private async _initSession(): Promise<void> {
    if (this.sessionInitialized) return;

    try {
      const response = await this.client.get(
        IsYatirimScreenerProvider.PAGE_URL,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        },
      );

      const setCookie = response.headers["set-cookie"];
      if (setCookie && Array.isArray(setCookie)) {
        this.cookies = setCookie.map((c) => c.split(";")[0]).join("; ");
      }

      // Extract request digest if present
      const match = /id="__REQUESTDIGEST"[^>]*value="([^"]+)"/.exec(
        response.data as string,
      );
      if (match) {
        this.requestDigest = match[1];
      }

      this.sessionInitialized = true;
    } catch {
      // Session initialization failed, but we can still try without it
      this.sessionInitialized = true;
    }
  }

  private _getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json, text/javascript, */*; q=0.01",
      Origin: IsYatirimScreenerProvider.BASE_URL,
      Referer: IsYatirimScreenerProvider.PAGE_URL,
    };

    if (this.cookies) {
      headers["Cookie"] = this.cookies;
    }
    if (this.requestDigest) {
      headers["X-RequestDigest"] = this.requestDigest;
    }
    return headers;
  }

  /**
   * Get all available screening criteria.
   */
  async getCriteria(): Promise<ScreenerCriteria[]> {
    if (this.criteriaCache) return this.criteriaCache;

    const cacheKey = "isyatirim:screener:criteria";
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.criteriaCache = cached as ScreenerCriteria[];
      return this.criteriaCache;
    }

    try {
      const response = await this.client.get(
        IsYatirimScreenerProvider.CRITERIA_URL,
        {
          headers: { "X-Requested-With": "XMLHttpRequest" },
        },
      );

      const data = response.data as IsYatirimCriteriaResponse;
      const criteria: ScreenerCriteria[] = [];

      for (const item of data.value || []) {
        const kriterTanim = item.KriterTanim || "";
        let id: string | undefined;

        if (kriterTanim.includes(";#")) {
          const parts = kriterTanim.split(";#");
          id = parts.length > 0 ? parts[0] : undefined;
        }

        const nameField = item.KriterTanim_x003a_Ba_x015f_l_x01 || "";
        let name = nameField;
        if (nameField.includes(";#")) {
          const parts = nameField.split(";#");
          name = parts.length > 1 ? parts[1] : "";
        }

        const minField = item.KriterTanim_x003a_MIN_DEGER || "";
        const maxField = item.KriterTanim_x003a_MAX_DEGER || "";

        const minVal = minField.includes(";#")
          ? minField.split(";#")[1]
          : minField;
        const maxVal = maxField.includes(";#")
          ? maxField.split(";#")[1]
          : maxField;

        if (id && name) {
          criteria.push({
            id,
            name,
            min: minVal,
            max: maxVal,
          });
        }
      }

      // Deduplicate
      const uniqueCriteria: ScreenerCriteria[] = [];
      const seen = new Set<string>();
      for (const c of criteria) {
        if (!seen.has(c.id)) {
          seen.add(c.id);
          uniqueCriteria.push(c);
        }
      }

      this.criteriaCache = uniqueCriteria;
      this.cache.set(cacheKey, uniqueCriteria, TTL.COMPANY_LIST);
      return uniqueCriteria;
    } catch (e) {
      throw new APIError(
        `Failed to fetch screening criteria: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Get list of sectors for filtering.
   */
  async getSectors(): Promise<Array<{ id: string; name: string }>> {
    if (this.sectorsCache) return this.sectorsCache;

    const cacheKey = "isyatirim:screener:sectors";
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.sectorsCache = cached as Array<{ id: string; name: string }>;
      return this.sectorsCache;
    }

    try {
      await this._initSession();
      const response = await this.client.get(
        IsYatirimScreenerProvider.PAGE_URL,
      );
      const $ = cheerio.load(response.data as string);

      const sectors: Array<{ id: string; name: string }> = [];
      const select = $(
        "select#ctl00_ctl58_g_877a6dc3_ec50_46c8_9ce3_f240bf1fe822_ctl00_ddlStockSector",
      );

      select.find("option").each((_, el) => {
        const value = $(el).attr("value") || "";
        const name = $(el).text().trim();
        if (value && name && name !== "Sektör Seçiniz") {
          sectors.push({ id: value, name });
        }
      });

      this.sectorsCache = sectors;
      this.cache.set(cacheKey, sectors, TTL.COMPANY_LIST);
      return sectors;
    } catch {
      return [];
    }
  }

  /**
   * Get list of indices for filtering.
   */
  async getIndices(): Promise<Array<{ id: string; name: string }>> {
    // Static list as per python implementation
    return [
      { id: "BIST 30", name: "BIST 30" },
      { id: "BIST 50", name: "BIST 50" },
      { id: "BIST 100", name: "BIST 100" },
      { id: "BIST BANKA", name: "BIST BANKA" },
      { id: "BIST SINAİ", name: "BIST SINAİ" },
      { id: "BIST HİZMETLER", name: "BIST HİZMETLER" },
      { id: "BIST TEKNOLOJİ", name: "BIST TEKNOLOJİ" },
    ];
  }

  /**
   * Screen stocks based on criteria.
   *
   * @param criterias List of [id, min, max, required] tuples
   * @param sector Sector name (e.g. "Bankacılık")
   * @param index Index name (e.g. "BIST 100")
   * @param recommendation Recommendation ("AL", "SAT", "TUT")
   */
  async screen(
    criterias: Array<[string, string, string, string]> = [],
    sector: string = "",
    index: string = "",
    recommendation: string = "",
    template?: string,
  ): Promise<ScreenerResult[]> {
    const payload: {
      sektor: string;
      endeks: string;
      takip: string;
      oneri: string;
      criterias: string[][];
      lang: string;
    } = {
      sektor: sector,
      endeks: index,
      takip: "",
      oneri: recommendation,
      criterias: [],
      lang: "1055", // Turkish
    };

    // Apply template if specified
    if (template && IsYatirimScreenerProvider.TEMPLATES[template]) {
      const tmpl = IsYatirimScreenerProvider.TEMPLATES[template];
      if (tmpl.criteria) {
        payload.criterias = tmpl.criteria.map((c) => [...c]);
      }
      if (tmpl.oneri) {
        payload.oneri = tmpl.oneri;
      }
    }

    // Add custom criterias
    if (criterias && criterias.length > 0) {
      for (const c of criterias) {
        payload.criterias.push([...c]);
      }
    }

    // If no criterias specified, add default price criteria
    if (payload.criterias.length === 0) {
      payload.criterias = [["7", "1", "50000", "False"]]; // Default price > 1
    }

    await this._initSession();

    const cacheKey = `isyatirim:screener:${JSON.stringify(payload)}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as ScreenerResult[];
    }

    try {
      const response = await this.client.post(
        IsYatirimScreenerProvider.SCREENER_URL,
        payload,
        { headers: this._getHeaders() },
      );

      const data = response.data as IsYatirimScreenerResponse;
      const resultStr = data.d || "[]";
      const results = JSON.parse(resultStr) as IsYatirimScreenerData[];

      const stocks: ScreenerResult[] = results.map((item) => {
        let symbol = item.Hisse || "";
        let name = "";

        if (symbol.includes(" - ")) {
          const parts = symbol.split(" - ", 2);
          symbol = parts[0].trim();
          name = parts[1].trim();
        }

        const stock: ScreenerResult = {
          symbol,
          name,
        };

        for (const [key, value] of Object.entries(item)) {
          if (key !== "Hisse") {
            const num = parseFloat(String(value).replace(/,/g, ".")); // Replace comma with dot for JS float
            stock[`criteria_${key}`] = isNaN(num) ? String(value) : num;
          }
        }
        return stock;
      });

      this.cache.set(cacheKey, stocks, TTL.REALTIME_PRICE * 15); // 15 mins
      return stocks;
    } catch (e) {
      throw new APIError(`Failed to screen stocks: ${(e as Error).message}`);
    }
  }
}

let provider: IsYatirimScreenerProvider | null = null;

export function getScreenerProvider(): IsYatirimScreenerProvider {
  if (!provider) {
    provider = new IsYatirimScreenerProvider();
  }
  return provider;
}
