import * as cheerio from "cheerio";

import { APIError, DataNotAvailableError } from "~/exceptions";
import { BaseProvider } from "~/providers/base";
import {
  BankRate,
  CurrentData,
  MetalInstitutionRate,
  OHLCVData,
} from "~/types";
import { TTL } from "~/utils/helpers";

export class DovizcomProvider extends BaseProvider {
  private static readonly BASE_URL = "https://api.doviz.com/api/v12";
  private static readonly KUR_BASE_URL = "https://kur.doviz.com";
  private static readonly TOKEN_EXPIRY = 3600; // 1 hour

  private static readonly FALLBACK_TOKEN =
    "6a0a7d78bd073bf0910bbb3c95c4ba7003af939d8c81a9c90e390303dcbdb394";

  private token: string | null = null;
  private tokenExpiry = 0;
  private customToken: string | null = null;

  // Bank/Currency/Metal slug mappings
  private static readonly BANK_SLUGS: Record<string, string> = {
    kapalicarsi: "kapalicarsi",
    altinkaynak: "altinkaynak",
    harem: "harem",
    odaci: "odaci",
    venus: "venus",
    getirfinans: "getirfinans",
    akbank: "akbank",
    albaraka: "albaraka-turk",
    alternatifbank: "alternatif-bank",
    anadolubank: "anadolubank",
    cepteteb: "cepteteb",
    denizbank: "denizbank",
    destekbank: "destekbank",
    dunyakatilim: "dunya-katilim",
    emlakkatilim: "emlak-katilim",
    enpara: "enpara",
    fibabanka: "fibabanka",
    garanti: "garanti-bbva",
    hadi: "hadi",
    halkbank: "halkbank",
    hayatfinans: "hayat-finans",
    hsbc: "hsbc",
    ing: "ing-bank",
    isbank: "isbankasi",
    kuveytturk: "kuveyt-turk",
    tcmb: "merkez-bankasi",
    misyonbank: "misyon-bank",
    odeabank: "odeabank",
    qnb: "qnb-finansbank",
    sekerbank: "sekerbank",
    turkiyefinans: "turkiye-finans",
    vakifbank: "vakifbank",
    vakifkatilim: "vakif-katilim",
    yapikredi: "yapikredi",
    ziraat: "ziraat-bankasi",
    ziraatkatilim: "ziraat-katilim",
  };

  private static readonly CURRENCY_SLUGS: Record<string, string> = {
    USD: "amerikan-dolari",
    EUR: "euro",
    GBP: "sterlin",
    CHF: "isvicre-frangi",
    CAD: "kanada-dolari",
    AUD: "avustralya-dolari",
    JPY: "japon-yeni",
    RUB: "rus-rublesi",
    AED: "birlesik-arap-emirlikleri-dirhemi",
    DKK: "danimarka-kronu",
    SEK: "isvec-kronu",
    NOK: "norvec-kronu",
    KWD: "kuveyt-dinari",
    ZAR: "guney-afrika-randi",
    SAR: "suudi-arabistan-riyali",
    PLN: "polonya-zlotisi",
    RON: "romen-leyi",
    CNY: "cin-yuani",
    HKD: "hong-kong-dolari",
    KRW: "guney-kore-wonu",
    QAR: "katar-riyali",
  };

  private static readonly METAL_SLUGS: Record<string, string> = {
    "gram-altin": "gram-altin",
    "gram-gumus": "gumus",
    "ons-altin": "ons",
    "gram-platin": "gram-platin",
  };

  private static readonly HISTORY_API_SLUGS: Record<string, string> = {
    "gram-gumus": "gumus",
    "ons-altin": "ons",
  };

  private static readonly INSTITUTION_IDS: Record<string, number> = {
    akbank: 1,
    "qnb-finansbank": 2,
    halkbank: 3,
    isbankasi: 4,
    vakifbank: 5,
    yapikredi: 6,
    "ziraat-bankasi": 7,
    "garanti-bbva": 8,
    sekerbank: 9,
    denizbank: 10,
    hsbc: 12,
    "turkiye-finans": 13,
    "ziraat-katilim": 14,
    "vakif-katilim": 15,
    "ing-bank": 16,
    "kuveyt-turk": 17,
    "albaraka-turk": 18,
    enpara: 19,
    kapalicarsi: 20,
    odaci: 22,
    harem: 23,
    altinkaynak: 24,
    "hayat-finans": 29,
    "emlak-katilim": 30,
    fibabanka: 31,
    odeabank: 36,
    getirfinans: 37,
  };

  private static readonly SUPPORTED_ASSETS = new Set([
    "USD",
    "EUR",
    "GBP",
    "JPY",
    "CHF",
    "CAD",
    "AUD",
    "gram-altin",
    "gram-gumus",
    "gram-platin",
    "ons-altin",
    "XAG-USD",
    "XPT-USD",
    "XPD-USD",
    "BRENT",
  ]);

  constructor(config?: { token?: string }) {
    super({
      baseUrl: "https://www.doviz.com",
    });
    if (config?.token) {
      this.customToken = config.token;
    }
  }

  /**
   * Set a custom bearer token for API requests.
   * Useful if auto-extraction fails or you want to use a specific token.
   */
  setToken(token: string): void {
    this.customToken = token;
    this.tokenExpiry = 0; // Reset expiry so it uses custom token immediately
  }

  private async _getToken(): Promise<string> {
    // Use custom token if set
    if (this.customToken) {
      return this.customToken;
    }

    const now = Date.now() / 1000;
    if (this.token && now < this.tokenExpiry) {
      return this.token;
    }

    try {
      const extractedToken = await this._extractToken();
      if (extractedToken) {
        this.token = extractedToken;
        this.tokenExpiry = now + DovizcomProvider.TOKEN_EXPIRY;
        return extractedToken;
      }
    } catch {
      // Fall through to fallback
    }

    return DovizcomProvider.FALLBACK_TOKEN;
  }

  private async _extractToken(): Promise<string | null> {
    try {
      const response = await this.client.get("https://www.doviz.com/");
      const html = response.data as string;

      const patterns = [
        /token["']?\s*:\s*["']([a-f0-9]{64})["']/i,
        /Bearer\s+([a-f0-9]{64})/i,
      ];

      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) {
          return match[1];
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private async _getHeaders(asset: string): Promise<Record<string, string>> {
    let origin: string;
    if (["gram-altin", "gumus", "ons"].includes(asset)) {
      origin = "https://altin.doviz.com";
    } else if (asset.toUpperCase() in DovizcomProvider.CURRENCY_SLUGS) {
      origin = "https://kur.doviz.com";
    } else {
      origin = "https://www.doviz.com";
    }

    const token = await this._getToken();

    return {
      Accept: "*/*",
      Authorization: `Bearer ${token}`,
      Origin: origin,
      Referer: `${origin}/`,
      "X-Requested-With": "XMLHttpRequest",
    };
  }

  /**
   * Get current price for an asset via API.
   * Note: For most assets, use canlidoviz provider (token-free).
   */
  async getCurrent(asset: string): Promise<CurrentData> {
    const normalizedAsset = asset.toUpperCase();
    const finalAsset = DovizcomProvider.SUPPORTED_ASSETS.has(normalizedAsset)
      ? normalizedAsset
      : asset;

    if (!DovizcomProvider.SUPPORTED_ASSETS.has(finalAsset)) {
      throw new DataNotAvailableError(
        `Unsupported asset: ${finalAsset}. Supported: ${Array.from(DovizcomProvider.SUPPORTED_ASSETS).join(", ")}`,
      );
    }

    const cacheKey = `dovizcom:current:${finalAsset}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as CurrentData;
    }

    try {
      const data = await this._getFromDaily(finalAsset);

      if (!data) {
        throw new DataNotAvailableError(`No data for ${finalAsset}`);
      }

      const result: CurrentData = {
        symbol: finalAsset,
        last: parseFloat(data.close || "0"),
        open: parseFloat(data.open || "0"),
        high: parseFloat(data.highest || "0"),
        low: parseFloat(data.lowest || "0"),
        updateTime: this._parseTimestamp(data.update_date),
      };

      this.cache.set(cacheKey, result, TTL.FX_RATES);
      return result;
    } catch (e) {
      throw new APIError(
        `Failed to fetch ${finalAsset}: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Get historical data for an asset via API.
   * Note: For most assets, use canlidoviz provider (token-free).
   */
  async getHistory(options: {
    asset: string;
    period?: string;
    start?: Date;
    end?: Date;
  }): Promise<OHLCVData[]> {
    const { asset, period = "1mo", start, end = new Date() } = options;

    const normalizedAsset = asset.toUpperCase();
    const finalAsset = DovizcomProvider.SUPPORTED_ASSETS.has(normalizedAsset)
      ? normalizedAsset
      : asset;

    if (!DovizcomProvider.SUPPORTED_ASSETS.has(finalAsset)) {
      throw new DataNotAvailableError(`Unsupported asset: ${finalAsset}`);
    }

    const periodDays: Record<string, number> = {
      "1d": 1,
      "5d": 5,
      "1mo": 30,
      "3mo": 90,
      "6mo": 180,
      "1y": 365,
    };

    const startDate =
      start || new Date(end.getTime() - (periodDays[period] || 30) * 86400000);

    const cacheKey = `dovizcom:history:${finalAsset}:${startDate.toISOString().split("T")[0]}:${end.toISOString().split("T")[0]}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as OHLCVData[];
    }

    try {
      const apiSlug =
        DovizcomProvider.HISTORY_API_SLUGS[finalAsset] || finalAsset;
      const url = `${DovizcomProvider.BASE_URL}/assets/${apiSlug}/archive`;
      const params = {
        start: Math.floor(startDate.getTime() / 1000).toString(),
        end: Math.floor(end.getTime() / 1000).toString(),
      };

      const headers = await this._getHeaders(finalAsset);
      const response = await this.client.get(url, { headers, params });

      interface ArchiveResponse {
        data?: {
          archive?: Array<{
            update_date?: number;
            open?: string;
            highest?: string;
            lowest?: string;
            close?: string;
          }>;
        };
      }

      const data = response.data as ArchiveResponse;
      const archive = data.data?.archive || [];

      const records: OHLCVData[] = archive.map((item) => ({
        date: this._parseTimestamp(item.update_date),
        open: parseFloat(item.open || "0"),
        high: parseFloat(item.highest || "0"),
        low: parseFloat(item.lowest || "0"),
        close: parseFloat(item.close || "0"),
        volume: 0,
      }));

      records.sort((a, b) => a.date.getTime() - b.date.getTime());

      this.cache.set(cacheKey, records, TTL.OHLCV_HISTORY);
      return records;
    } catch (e) {
      throw new APIError(
        `Failed to fetch history for ${finalAsset}: ${(e as Error).message}`,
      );
    }
  }

  private async _getFromDaily(
    asset: string,
  ): Promise<Record<string, string> | null> {
    const apiSlug = DovizcomProvider.HISTORY_API_SLUGS[asset] || asset;
    const url = `${DovizcomProvider.BASE_URL}/assets/${apiSlug}/daily`;
    const headers = await this._getHeaders(asset);

    const response = await this.client.get(url, {
      headers,
      params: { limit: "1" },
    });

    interface DailyResponse {
      data?: {
        archive?: Array<Record<string, string>>;
      };
    }

    const data = response.data as DailyResponse;
    const archive = data.data?.archive || [];
    return archive[0] || null;
  }

  private _parseTimestamp(ts: unknown): Date {
    if (typeof ts === "number") {
      return new Date(ts * 1000);
    }
    if (typeof ts === "string") {
      return new Date(parseInt(ts, 10) * 1000);
    }
    if (ts instanceof Date) {
      return ts;
    }
    return new Date();
  }

  /** Get list of supported banks */
  getBanks(): string[] {
    return Object.keys(DovizcomProvider.BANK_SLUGS).sort();
  }

  /** Get bank exchange rates */
  async getBankRates(
    asset: string,
    bank?: string,
  ): Promise<BankRate[] | BankRate> {
    const upperAsset = asset.toUpperCase();
    const currencySlug = DovizcomProvider.CURRENCY_SLUGS[upperAsset];

    if (!currencySlug) {
      throw new DataNotAvailableError(
        `Unsupported currency: ${upperAsset}. Supported: ${Object.keys(DovizcomProvider.CURRENCY_SLUGS).join(", ")}`,
      );
    }

    if (bank) {
      const lowerBank = bank.toLowerCase();
      const bankSlug = DovizcomProvider.BANK_SLUGS[lowerBank];

      if (!bankSlug) {
        throw new DataNotAvailableError(
          `Unknown bank: ${lowerBank}. Supported: ${Object.keys(DovizcomProvider.BANK_SLUGS).join(", ")}`,
        );
      }

      const cacheKey = `dovizcom:bank_rate:${upperAsset}:${lowerBank}`;
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached as BankRate;
      }

      const result = await this._fetchSingleBankRate(
        lowerBank,
        bankSlug,
        currencySlug,
        upperAsset,
      );
      this.cache.set(cacheKey, result, TTL.FX_RATES);
      return result;
    } else {
      const cacheKey = `dovizcom:bank_rates:${upperAsset}`;
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached as BankRate[];
      }

      const result = await this._fetchAllBankRates(currencySlug, upperAsset);
      this.cache.set(cacheKey, result, TTL.FX_RATES);
      return result;
    }
  }

  private async _fetchSingleBankRate(
    bank: string,
    bankSlug: string,
    currencySlug: string,
    asset: string,
  ): Promise<BankRate> {
    const url = `${DovizcomProvider.KUR_BASE_URL}/${bankSlug}/${currencySlug}`;

    try {
      const response = await this.client.get(url);
      const html = response.data as string;

      const [buy, sell] = this._parseBankRateHTML(html);

      if (buy === null || sell === null) {
        throw new DataNotAvailableError(`Could not parse rates for ${bank}`);
      }

      const spread = buy > 0 ? ((sell - buy) / buy) * 100 : 0;

      return {
        bank,
        currency: asset,
        buy,
        sell,
        spread: Math.round(spread * 100) / 100,
      };
    } catch (e) {
      throw new APIError(
        `Failed to fetch bank rate for ${bank}: ${(e as Error).message}`,
      );
    }
  }

  private async _fetchAllBankRates(
    currencySlug: string,
    asset: string,
  ): Promise<BankRate[]> {
    const url = `${DovizcomProvider.KUR_BASE_URL}/serbest-piyasa/${currencySlug}`;

    try {
      const response = await this.client.get(url);
      const html = response.data as string;

      const records = this._parseAllBankRatesHTML(html, asset);

      if (records.length === 0) {
        throw new DataNotAvailableError(
          `Could not parse bank rates for ${asset}`,
        );
      }

      return records.sort((a, b) => a.bank.localeCompare(b.bank));
    } catch (e) {
      throw new APIError(
        `Failed to fetch bank rates for ${asset}: ${(e as Error).message}`,
      );
    }
  }

  private _parseBankRateHTML(html: string): [number | null, number | null] {
    const $ = cheerio.load(html);
    let buy: number | null = null;
    let sell: number | null = null;

    const bidElem = $('[data-socket-attr="bid"]');
    const askElem = $('[data-socket-attr="ask"]');

    if (bidElem.length && askElem.length) {
      buy = this._parseTurkishNumber(bidElem.text().trim());
      sell = this._parseTurkishNumber(askElem.text().trim());
      return [buy, sell];
    }

    const pattern = /Al[ıi][şs]\s*([\d.,]+)\s*\/\s*Sat[ıi][şs]\s*([\d.,]+)/i;
    const match = html.match(pattern);
    if (match) {
      buy = this._parseTurkishNumber(match[1]);
      sell = this._parseTurkishNumber(match[2]);
    }

    return [buy, sell];
  }

  private _parseAllBankRatesHTML(html: string, asset: string): BankRate[] {
    const $ = cheerio.load(html);
    const records: BankRate[] = [];

    const tables = $("table[data-sortable]");

    tables.each((_, table) => {
      const tbody = $(table).find("tbody");
      if (!tbody.length) return;

      tbody.find("tr").each((_, row) => {
        const cells = $(row).find("td");
        if (cells.length < 5) return;

        const link = cells.eq(0).find("a");
        if (!link.length || !link.attr("href")) return;

        const href = link.attr("href") || "";
        const slugMatch = href.match(/kur\.doviz\.com\/([^/]+)\//);
        if (!slugMatch) return;

        const bankSlug = slugMatch[1];
        const bankName = link.text().trim();

        const buy = this._parseTurkishNumber(cells.eq(1).text().trim());
        const sell = this._parseTurkishNumber(cells.eq(2).text().trim());
        const spreadText = cells.eq(4).text().trim().replace("%", "");
        let spread = this._parseTurkishNumber(spreadText);

        if (buy && sell) {
          if (!spread) {
            spread = ((sell - buy) / buy) * 100;
          }

          let bankCode = bankSlug;
          for (const [code, slug] of Object.entries(
            DovizcomProvider.BANK_SLUGS,
          )) {
            if (slug === bankSlug) {
              bankCode = code;
              break;
            }
          }

          records.push({
            bank: bankCode,
            bankName,
            currency: asset,
            buy,
            sell,
            spread: Math.round((spread || 0) * 100) / 100,
          });
        }
      });
    });

    return records;
  }

  /** Get list of supported precious metal assets */
  getMetalInstitutions(): string[] {
    return Object.keys(DovizcomProvider.METAL_SLUGS).sort();
  }

  /** Get precious metal rates from institutions */
  async getMetalInstitutionRates(
    asset: string,
    institution?: string,
  ): Promise<MetalInstitutionRate[] | MetalInstitutionRate> {
    if (!(asset in DovizcomProvider.METAL_SLUGS)) {
      throw new DataNotAvailableError(
        `Asset '${asset}' not supported. Supported: ${Object.keys(DovizcomProvider.METAL_SLUGS).join(", ")}`,
      );
    }

    if (institution) {
      const cacheKey = `dovizcom:metal_institution_rate:${asset}:${institution}`;
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached as MetalInstitutionRate;
      }

      const allRates = await this._fetchAllMetalInstitutionRates(asset);
      const rate = allRates.find((r) => r.institution === institution);

      if (!rate) {
        throw new DataNotAvailableError(
          `Institution '${institution}' not found for asset '${asset}'`,
        );
      }

      this.cache.set(cacheKey, rate, TTL.FX_RATES);
      return rate;
    }

    const cacheKey = `dovizcom:metal_institution_rates:${asset}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as MetalInstitutionRate[];
    }

    const rates = await this._fetchAllMetalInstitutionRates(asset);
    const sorted = rates.sort((a, b) =>
      a.institution.localeCompare(b.institution),
    );

    this.cache.set(cacheKey, sorted, TTL.FX_RATES);
    return sorted;
  }

  private async _fetchAllMetalInstitutionRates(
    asset: string,
  ): Promise<MetalInstitutionRate[]> {
    const slug = DovizcomProvider.METAL_SLUGS[asset] || asset;
    const url = `https://altin.doviz.com/${slug}`;

    try {
      const response = await this.client.get(url);
      const html = response.data as string;
      return this._parseMetalInstitutionRatesHTML(html, asset);
    } catch (e) {
      throw new APIError(
        `Failed to fetch metal institution rates: ${(e as Error).message}`,
      );
    }
  }

  private _parseMetalInstitutionRatesHTML(
    html: string,
    asset: string,
  ): MetalInstitutionRate[] {
    const $ = cheerio.load(html);
    const records: MetalInstitutionRate[] = [];

    const tables = $("table[data-sortable]");

    tables.each((_, table) => {
      const tbody = $(table).find("tbody");
      if (!tbody.length) return;

      tbody.find("tr").each((_, row) => {
        const cells = $(row).find("td");
        if (cells.length < 5) return;

        const link = cells.eq(0).find("a");
        if (!link.length) return;

        const href = link.attr("href") || "";
        const institutionName = link.text().trim();

        const slugMatch = href.match(/altin\.doviz\.com\/([^/]+)/);
        if (!slugMatch) return;

        const institutionSlug = slugMatch[1];

        if (institutionSlug in DovizcomProvider.METAL_SLUGS) return;

        const buy = this._parseTurkishNumber(cells.eq(1).text().trim());
        const sell = this._parseTurkishNumber(cells.eq(2).text().trim());
        const spreadText = cells.eq(4).text().trim().replace("%", "").trim();
        let spread = this._parseTurkishNumber(spreadText);

        if (buy && sell) {
          if (!spread) {
            spread = ((sell - buy) / buy) * 100;
          }

          records.push({
            institution: institutionSlug,
            institutionName,
            asset,
            buy,
            sell,
            spread: Math.round((spread || 0) * 100) / 100,
          });
        }
      });
    });

    return records;
  }

  /**
   * Get historical data for a specific institution's metal rates.
   * Note: For currencies and gram-altin, use canlidoviz provider instead.
   */
  async getInstitutionHistory(options: {
    asset: keyof typeof DovizcomProvider.METAL_SLUGS;
    institution: keyof typeof DovizcomProvider.INSTITUTION_IDS;
    period?: string;
    start?: Date;
    end?: Date;
  }): Promise<OHLCVData[]> {
    const {
      asset,
      institution,
      period = "1mo",
      start,
      end = new Date(),
    } = options;

    if (!(institution in DovizcomProvider.INSTITUTION_IDS)) {
      const supported = Object.keys(DovizcomProvider.INSTITUTION_IDS).join(
        ", ",
      );
      throw new DataNotAvailableError(
        `Unsupported institution: ${institution}. Supported: ${supported}`,
      );
    }

    if (!(asset in DovizcomProvider.METAL_SLUGS)) {
      const metalSupported = Object.keys(DovizcomProvider.METAL_SLUGS).join(
        ", ",
      );
      throw new DataNotAvailableError(
        `Unsupported asset: ${asset}. Supported metals: ${metalSupported}. For currencies, use canlidoviz provider.`,
      );
    }

    const apiAssetSlug = DovizcomProvider.METAL_SLUGS[asset];

    const periodDays: Record<string, number> = {
      "1d": 1,
      "5d": 5,
      "1mo": 30,
      "3mo": 90,
      "6mo": 180,
      "1y": 365,
    };

    const startDate =
      start || new Date(end.getTime() - (periodDays[period] || 30) * 86400000);

    const cacheKey = `dovizcom:institution_history:${asset}:${institution}:${startDate.toISOString().split("T")[0]}:${end.toISOString().split("T")[0]}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as OHLCVData[];
    }

    try {
      const institutionId = DovizcomProvider.INSTITUTION_IDS[institution];
      const apiSlug = `${institutionId}-${apiAssetSlug}`;

      const url = `${DovizcomProvider.BASE_URL}/assets/${apiSlug}/archive`;
      const params = {
        start: Math.floor(startDate.getTime() / 1000).toString(),
        end: Math.floor(end.getTime() / 1000).toString(),
      };

      const headers = await this._getHeaders(asset);
      const response = await this.client.get(url, { headers, params });

      interface ArchiveResponse {
        data?: {
          archive?: Array<{
            update_date?: number;
            open?: string;
            highest?: string;
            lowest?: string;
            close?: string;
          }>;
        };
      }

      const data = response.data as ArchiveResponse;
      const archive = data.data?.archive || [];

      const records: OHLCVData[] = archive.map((item) => ({
        date: this._parseTimestamp(item.update_date),
        open: parseFloat(item.open || "0"),
        high: parseFloat(item.highest || "0"),
        low: parseFloat(item.lowest || "0"),
        close: parseFloat(item.close || "0"),
        volume: 0,
      }));

      records.sort((a, b) => a.date.getTime() - b.date.getTime());

      this.cache.set(cacheKey, records, TTL.OHLCV_HISTORY);
      return records;
    } catch (e) {
      throw new APIError(
        `Failed to fetch institution history for ${asset} from ${institution}: ${(e as Error).message}`,
      );
    }
  }

  /** Get list of institutions that support metal history data */
  getHistoryInstitutions(): string[] {
    return Object.keys(DovizcomProvider.INSTITUTION_IDS);
  }

  private _parseTurkishNumber(value: string): number | null {
    if (!value) return null;

    try {
      let cleaned = value.trim().replace(/\s/g, "");

      if (cleaned.includes(".") && cleaned.includes(",")) {
        cleaned = cleaned.replace(/\./g, "").replace(",", ".");
      } else if (cleaned.includes(",")) {
        cleaned = cleaned.replace(",", ".");
      }

      return parseFloat(cleaned);
    } catch {
      return null;
    }
  }
}

// Singleton
let provider: DovizcomProvider | null = null;

export function getDovizcomProvider(config?: {
  token?: string;
}): DovizcomProvider {
  if (!provider) {
    provider = new DovizcomProvider(config);
  } else if (config?.token) {
    // Update token if provided
    provider.setToken(config.token);
  }
  return provider;
}
