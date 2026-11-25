import https from "https";
import axios, { AxiosResponse } from "axios";

import { APIError, DataNotAvailableError } from "~/exceptions";
import { BaseProvider } from "~/providers/base";
import { FundType } from "~/types";
import { sleep, TTL } from "~/utils/helpers";

/**
 * Asset-type code -> Turkish label, for the `dagilimSiraliGetirT` endpoint.
 *
 * Empirically verified against TEFAS's own rendered pages (aligned with
 * borsapy v0.11.0). Rare unverified codes (kksd, kmbyf, kksyd, vmau, btaa,
 * khau, gas) are deliberately absent and surface as `asset_type: null`
 * rather than a guess.
 */
export const ASSET_TYPE_LABELS: Record<string, string> = {
  hs: "Hisse Senedi",
  yhs: "Yabancı Hisse Senedi",
  dt: "Devlet Tahvili",
  hb: "Hazine Bonosu",
  fb: "Finansman Bonosu",
  ost: "Özel Sektör Tahvili",
  vdm: "Varlığa Dayalı Menkul Kıymetler",
  kba: "Kamu Dış Borçlanma Araçları",
  osdb: "Özel Sektör Dış Borçlanma Araçları",
  kibd: "Döviz Cinsi Kamu İç Borçlanma Araçları",
  kkstl: "Kamu Kira Sertifikaları (TL)",
  osks: "Özel Sektör Kira Sertifikaları",
  oksyd: "Özel Sektör Yurt Dışı Kira Sertifikaları",
  tr: "Ters-Repo",
  r: "Repo",
  btas: "BİST Taahhütlü İşlem Pazarı Satım",
  tpp: "Takasbank Para Piyasası",
  bpp: "Borsa İstanbul Para Piyasası",
  vmtl: "Mevduat (TL)",
  vmd: "Mevduat (Döviz)",
  khtl: "Katılma Hesabı (TL)",
  khd: "Katılma Hesabı (Döviz)",
  km: "Kıymetli Madenler",
  kmkba: "Kıymetli Madenler Cinsinden İhraç Edilen Kamu Borçlanma Araçları",
  kmkks: "Kıymetli Madenler Cinsinden İhraç Edilen Kamu Kira Sertifikaları",
  ybyf: "Yabancı Borsa Yatırım Fonları",
  ybosb: "Yabancı Özel Sektör Borçlanma Araçları",
  ybkb: "Yabancı Kamu Borçlanma Araçları",
  byf: "Borsa Yatırım Fonları Katılma Payları",
  yyf: "Yatırım Fonları Katılma Payları",
  gykb: "Gayrimenkul Yatırım Fonları Katılma Payları",
  gsykb: "Girişim Sermayesi Yatırım Fonları Katılma Payları",
  vint: "Vadeli İşlemler Nakit Teminatları",
  d: "Diğer",
};

/**
 * Turkish label -> standardised English name.
 * Keys match ASSET_TYPE_LABELS values exactly; a miss yields `asset_name: null`.
 */
export const ASSET_NAME_STANDARDIZATION: Record<string, string> = {
  "Hisse Senedi": "Stocks",
  "Yabancı Hisse Senedi": "Foreign Stocks",
  "Devlet Tahvili": "Government Bonds",
  "Hazine Bonosu": "Treasury Bills",
  "Finansman Bonosu": "Commercial Paper",
  "Özel Sektör Tahvili": "Corporate Bonds",
  "Varlığa Dayalı Menkul Kıymetler": "Asset Backed Securities",
  "Kamu Dış Borçlanma Araçları": "Government Eurobonds",
  "Özel Sektör Dış Borçlanma Araçları": "Corporate Eurobonds",
  "Döviz Cinsi Kamu İç Borçlanma Araçları": "FX-Denominated Domestic Govt Debt",
  "Kamu Kira Sertifikaları (TL)": "Government Sukuk (TRY)",
  "Özel Sektör Kira Sertifikaları": "Corporate Sukuk",
  "Özel Sektör Yurt Dışı Kira Sertifikaları": "Corporate Foreign Sukuk",
  "Ters-Repo": "Reverse Repo",
  Repo: "Repo",
  "BİST Taahhütlü İşlem Pazarı Satım":
    "BIST Committed Transactions Market Sale",
  "Takasbank Para Piyasası": "Takasbank Money Market",
  "Borsa İstanbul Para Piyasası": "Borsa Istanbul Money Market",
  "Mevduat (TL)": "TL Deposits",
  "Mevduat (Döviz)": "FX Deposits",
  "Katılma Hesabı (TL)": "TL Participation Accounts",
  "Katılma Hesabı (Döviz)": "FX Participation Accounts",
  "Kıymetli Madenler": "Precious Metals",
  "Kıymetli Madenler Cinsinden İhraç Edilen Kamu Borçlanma Araçları":
    "Precious-Metal Denominated Government Debt",
  "Kıymetli Madenler Cinsinden İhraç Edilen Kamu Kira Sertifikaları":
    "Precious-Metal Denominated Government Sukuk",
  "Yabancı Borsa Yatırım Fonları": "Foreign ETFs",
  "Yabancı Özel Sektör Borçlanma Araçları": "Foreign Corporate Debt",
  "Yabancı Kamu Borçlanma Araçları": "Foreign Government Debt",
  "Borsa Yatırım Fonları Katılma Payları": "ETF Shares",
  "Yatırım Fonları Katılma Payları": "Fund Shares",
  "Gayrimenkul Yatırım Fonları Katılma Payları": "REIF Shares",
  "Girişim Sermayesi Yatırım Fonları Katılma Payları": "VC Fund Shares",
  "Vadeli İşlemler Nakit Teminatları": "Futures Margin",
  Diğer: "Other",
};

export interface FundDetail {
  fund_code: string;
  name: string;
  date?: string;
  price: number;
  fund_size: number;
  investor_count: number;
  founder?: string;
  manager?: string;
  fund_type: string;
  fund_class?: FundType;
  category: string;
  risk_value: number;
  // Performance
  return_1m?: number;
  return_3m?: number;
  return_6m?: number;
  return_ytd?: number;
  return_1y?: number;
  return_3y?: number;
  return_5y?: number;
  daily_return?: number;
  weekly_return?: number;
  // Category ranking
  category_rank?: number;
  category_fund_count?: number;
  market_share?: number;
  // Profile (from fonProfilBilgiGetir)
  isin?: string;
  last_trading_time?: string;
  first_trading_time?: string;
  min_purchase?: string | number;
  min_redemption?: string | number;
  max_purchase?: string | number;
  max_redemption?: string | number;
  buy_valor?: number;
  sell_valor?: number;
  entry_fee?: number;
  exit_fee?: number;
  kap_link?: string;
  tefas_status?: string;
  allocation?: Array<{
    code?: string;
    asset_type: string | null;
    asset_name: string | null;
    weight: number;
  }>;
}

export interface FundHistoryItem {
  date: Date;
  price: number;
  fundSize: number;
  investors: number;
}

export interface AllocationItem {
  date: Date;
  code: string;
  asset_type: string | null;
  asset_name: string | null;
  weight: number;
}

export interface ScreenFundsOptions {
  fundType?: FundType;
  founder?: string;
  minReturn1m?: number;
  minReturn3m?: number;
  minReturn6m?: number;
  minReturnYtd?: number;
  minReturn1y?: number;
  minReturn3y?: number;
  minReturn5y?: number;
  limit?: number;
}

export interface ScreenFundResult {
  fund_code: string;
  name: string;
  fund_type: string;
  return_1m?: number;
  return_3m?: number;
  return_6m?: number;
  return_ytd?: number;
  return_1y?: number;
  return_3y?: number;
  return_5y?: number;
}

export interface PostJsonV2Options {
  errorsAsEmpty?: readonly string[];
  rateLimitBackoffMs?: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export class TEFASProvider extends BaseProvider {
  private static readonly BASE_URL_V2 = "https://www.tefas.gov.tr/api/funds";

  /**
   * Map period strings to the `fonFiyatBilgiGetir` `periyod` enum.
   * Maximum window supported by the TEFAS v2 API is 5 years (`periyod=60`).
   */
  public static readonly PERIOD_TO_PERIYOD: Record<string, number> = {
    "1d": 13,
    "5d": 13,
    "1w": 13,
    "1wk": 13,
    "1mo": 1,
    "3mo": 3,
    "6mo": 6,
    ytd: 0,
    "1y": 12,
    "2y": 36,
    "3y": 36,
    "5y": 60,
    max: 60,
  };

  private static readonly PERIYOD_MAX = 60;

  // --- Portfolio allocation (dagilimSiraliGetirT) constants ---
  public static readonly ALLOCATION_ENDPOINT = "dagilimSiraliGetirT";
  private static readonly ALLOCATION_META = new Set([
    "fonKodu",
    "fonUnvan",
    "tarih",
    "bilFiyat",
  ]);
  private static readonly ALLOCATION_NO_MATCH = "Index 0 out of bounds";
  private static readonly ALLOCATION_MAX_WINDOW_DAYS = 28;
  public static readonly ALLOCATION_FUND_TYPES: readonly FundType[] = [
    "YAT",
    "EMK",
    "BYF",
  ];

  constructor() {
    super({
      baseUrl: "https://www.tefas.gov.tr",
    });

    // Disable SSL verification for TEFAS
    this.client.defaults.httpsAgent = new https.Agent({
      rejectUnauthorized: false,
    });
  }

  /**
   * Parse TEFAS JSON response with descriptive errors for non-JSON bodies.
   */
  static _safeJson(response: AxiosResponse, endpoint: string): unknown {
    const status = response.status;
    const contentType = String(response.headers["content-type"] || "");
    const body = typeof response.data === "string" ? response.data : "";

    if (
      response.data === null ||
      response.data === undefined ||
      (typeof response.data === "string" && !response.data.trim())
    ) {
      throw new APIError(
        `TEFAS ${endpoint} returned an empty response ` +
          `(HTTP ${status}, content-type=${JSON.stringify(contentType)}). ` +
          "Upstream API may be down or rate-limited.",
      );
    }

    if (!contentType.toLowerCase().includes("json")) {
      const preview =
        typeof body === "string"
          ? body.slice(0, 200)
          : JSON.stringify(response.data).slice(0, 200);
      throw new APIError(
        `TEFAS ${endpoint} returned non-JSON response ` +
          `(HTTP ${status}, content-type=${JSON.stringify(contentType)}). ` +
          `Body preview: ${JSON.stringify(preview)}`,
      );
    }

    if (typeof response.data === "object") {
      return response.data;
    }

    try {
      return JSON.parse(body);
    } catch (e) {
      const preview = body.slice(0, 200);
      throw new APIError(
        `TEFAS ${endpoint} returned malformed JSON ` +
          `(HTTP ${status}, content-type=${JSON.stringify(contentType)}): ` +
          `${(e as Error).message}. Body preview: ${JSON.stringify(preview)}`,
      );
    }
  }

  /**
   * POST to TEFAS (form-urlencoded) and parse JSON, retrying transient WAF blocks.
   * Retained for backward compatibility.
   */
  async _postJson(
    url: string,
    data: string | URLSearchParams,
    endpoint: string,
    headers?: Record<string, string>,
    maxRetries: number = 3,
  ): Promise<unknown> {
    let lastError: APIError | null = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) {
        await sleep(500 * Math.pow(2, attempt - 1));
      }

      const response = await this.client.post(url, data, { headers });
      try {
        return TEFASProvider._safeJson(response, endpoint);
      } catch (e) {
        if (e instanceof APIError) {
          lastError = e;
        } else {
          throw e;
        }
      }
    }

    throw lastError!;
  }

  /**
   * POST to the TEFAS `/api/funds/*` v2 endpoints with a JSON body.
   *
   * Handles the `{errorCode, errorMessage, resultList}` envelope, retries
   * transient WAF blocks and HTTP 429 rate limits, and optionally translates
   * known empty-match error messages into `[]`.
   */
  async _postJsonV2(
    endpointPath: string,
    payload: Record<string, unknown>,
    endpointLabel: string,
    maxRetries: number = 3,
    options: PostJsonV2Options = {},
  ): Promise<Record<string, unknown>[]> {
    const { errorsAsEmpty = [], rateLimitBackoffMs = 20_000 } = options;
    const url = `${TEFASProvider.BASE_URL_V2}/${endpointPath}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent":
        (this.client.defaults.headers?.common?.["User-Agent"] as string) ||
        "borsats",
    };

    let lastError: APIError | null = null;
    let rateLimited = false;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) {
        const delayMs = rateLimited
          ? rateLimitBackoffMs
          : 500 * Math.pow(2, attempt - 1);
        if (delayMs > 0) {
          await sleep(delayMs);
        }
      }

      rateLimited = false;
      let response: AxiosResponse;
      try {
        response = await this.client.post(url, payload, { headers });
      } catch (e) {
        if (axios.isAxiosError(e) && e.response?.status === 429) {
          rateLimited = true;
          lastError = new APIError(
            `TEFAS ${endpointLabel} rate limited (HTTP 429). The block clears in about 45 seconds.`,
            429,
          );
          continue;
        }
        throw e;
      }

      // Handle HTTP 429 when validateStatus permits or mocked response resolves with status 429
      if (response.status === 429) {
        rateLimited = true;
        lastError = new APIError(
          `TEFAS ${endpointLabel} rate limited (HTTP 429). The block clears in about 45 seconds.`,
          429,
        );
        continue;
      }

      let data: unknown;
      try {
        data = TEFASProvider._safeJson(response, endpointLabel);
      } catch (e) {
        if (e instanceof APIError) {
          lastError = e;
          continue;
        }
        throw e;
      }

      // Unwrap the v2 envelope
      if (typeof data === "object" && data !== null && !Array.isArray(data)) {
        const obj = data as Record<string, unknown>;
        const errMsg = obj.errorMessage as string | undefined;
        if (errMsg) {
          if (errorsAsEmpty.some((marker) => errMsg.includes(marker))) {
            return [];
          }
          throw new APIError(
            `TEFAS ${endpointLabel} returned error: ${errMsg}`,
          );
        }
        const resultList = obj.resultList;
        if (resultList === undefined || resultList === null) {
          return [];
        }
        return resultList as Record<string, unknown>[];
      }

      // Unexpected shape — return as-is wrapped in a list
      return data ? [data as Record<string, unknown>] : [];
    }

    throw lastError!;
  }

  /**
   * Look up a fund in the cached returns list, falling back to the other
   * fund class (YAT <-> EMK) if not found.
   */
  private async _lookupFundReturns(
    fundCode: string,
    fundType: FundType,
  ): Promise<{
    fundReturn: Record<string, unknown>;
    detectedClass: FundType | null;
  }> {
    const fallbackType: FundType = fundType === "YAT" ? "EMK" : "YAT";
    const candidates: FundType[] =
      fundType === "BYF" ? ["YAT", "EMK"] : [fundType, fallbackType];

    for (const ftype of candidates) {
      const returnsCacheKey = `tefas:all_returns:${ftype}`;
      let allReturns = this.cache.get(returnsCacheKey) as
        Record<string, unknown>[] | undefined;
      if (allReturns === null || allReturns === undefined) {
        allReturns = await this._postJsonV2(
          "fonGetiriBazliBilgiGetir",
          {
            fonTipi: ftype,
            dil: "TR",
            calismaTipi: 2,
            donemGetiri1a: "1",
            donemGetiri3a: "1",
            donemGetiri6a: "1",
            donemGetiriyb: "1",
            donemGetiri1y: "1",
            donemGetiri3y: "1",
            donemGetiri5y: "1",
          },
          "fonGetiriBazliBilgiGetir",
        );
        this.cache.set(returnsCacheKey, allReturns, TTL.FX_RATES);
      }

      for (const entry of allReturns) {
        if ((entry.fonKodu as string) === fundCode) {
          return { fundReturn: entry, detectedClass: ftype };
        }
      }
    }

    return { fundReturn: {}, detectedClass: null };
  }

  /**
   * Get detailed information about a fund (merges fonBilgiGetir,
   * fonGetiriBazliBilgiGetir, and fonProfilBilgiGetir).
   */
  async getFundDetail(
    fundCode: string,
    fundType: FundType = "YAT",
  ): Promise<FundDetail> {
    const code = fundCode.toUpperCase();
    const type = fundType.toUpperCase() as FundType;
    const cacheKey = `tefas:detail:${code}:${type}`;

    const cached = this.cache.get(cacheKey);
    if (cached) return cached as FundDetail;

    try {
      // --- 1. Core fund info from fonBilgiGetir ---
      const infoList = await this._postJsonV2(
        "fonBilgiGetir",
        { fonKodu: code },
        "fonBilgiGetir",
      );

      if (!infoList || infoList.length === 0) {
        throw new DataNotAvailableError(`No data for fund: ${code}`);
      }

      const fundInfo = infoList[0];

      // --- 2. Return data from fonGetiriBazliBilgiGetir (with YAT<->EMK fallback) ---
      let fundReturn: Record<string, unknown> = {};
      let detectedClass: FundType | null = null;
      try {
        const lookup = await this._lookupFundReturns(code, type);
        fundReturn = lookup.fundReturn;
        detectedClass = lookup.detectedClass;
      } catch {
        // Returns data is supplementary; don't fail the whole call
      }

      // --- 3. Profile data from fonProfilBilgiGetir ---
      let fundProfile: Record<string, unknown> = {};
      try {
        const profileList = await this._postJsonV2(
          "fonProfilBilgiGetir",
          { fonKodu: code, dil: "TR" },
          "fonProfilBilgiGetir",
        );
        if (profileList && profileList.length > 0) {
          fundProfile = profileList[0];
        }
      } catch {
        // Profile data is supplementary; don't fail the whole call
      }

      const detail: FundDetail = {
        fund_code: code,
        name:
          (fundInfo.fonUnvan as string) ||
          (fundProfile.fonUnvan as string) ||
          "",
        date: undefined,
        price: Number(fundInfo.sonFiyat || 0),
        fund_size: Number(fundInfo.portBuyukluk || 0),
        investor_count: Number(fundInfo.yatirimciSayi || 0),
        founder: undefined,
        manager: undefined,
        fund_type: (fundReturn.fonTurAciklama as string) || "",
        fund_class: detectedClass || type,
        category: (fundInfo.fonKategori as string) || "",
        risk_value: Number(
          fundProfile.riskDegeri || fundReturn.riskDegeri || 0,
        ),
        return_1m: fundReturn.getiri1a as number | undefined,
        return_3m: fundReturn.getiri3a as number | undefined,
        return_6m: fundReturn.getiri6a as number | undefined,
        return_ytd: fundReturn.getiriyb as number | undefined,
        return_1y: fundReturn.getiri1y as number | undefined,
        return_3y: fundReturn.getiri3y as number | undefined,
        return_5y: fundReturn.getiri5y as number | undefined,
        daily_return: fundInfo.gunlukGetiri as number | undefined,
        weekly_return: undefined,
        category_rank: fundInfo.kategoriDerece as number | undefined,
        category_fund_count: fundInfo.kategoriFonSay as number | undefined,
        market_share: fundInfo.pazarPayi as number | undefined,
        isin: (fundProfile.isinKodu as string | undefined) ?? undefined,
        last_trading_time:
          (fundProfile.sonIsSaat as string | undefined) ?? undefined,
        first_trading_time:
          (fundProfile.basIsSaat as string | undefined) ?? undefined,
        min_purchase:
          (fundProfile.minAlis as string | number | undefined) ?? undefined,
        min_redemption:
          (fundProfile.minSatis as string | number | undefined) ?? undefined,
        max_purchase:
          (fundProfile.maxAlis as string | number | undefined) ?? undefined,
        max_redemption:
          (fundProfile.maxSatis as string | number | undefined) ?? undefined,
        buy_valor:
          (fundProfile.fonGeriAlisValor as number | undefined) ?? undefined,
        sell_valor:
          (fundProfile.fonSatisValor as number | undefined) ?? undefined,
        entry_fee:
          (fundProfile.girisKomisyonu as number | undefined) ?? undefined,
        exit_fee:
          (fundProfile.cikisKomisyonu as number | undefined) ?? undefined,
        kap_link: (fundProfile.kapLink as string | undefined) ?? undefined,
        tefas_status:
          (fundProfile.tefasDurum as string | undefined) ?? undefined,
        allocation: undefined,
      };

      this.cache.set(cacheKey, detail, TTL.FX_RATES);
      return detail;
    } catch (e) {
      if (e instanceof DataNotAvailableError) throw e;
      if (e instanceof APIError) throw e;
      throw new APIError(
        `Failed to fetch fund detail for ${code}: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Pick the smallest `fonFiyatBilgiGetir` periyod enum covering the window.
   */
  _resolvePeriyod(period: string, start?: Date, end?: Date): number {
    if (start) {
      const now = new Date();
      const spanDays = Math.floor(
        (now.getTime() - start.getTime()) / MS_PER_DAY,
      );
      const buckets: Array<[number, number]> = [
        [13, 7],
        [1, 31],
        [3, 95],
        [6, 190],
        [12, 380],
        [36, 365 * 3 + 5],
        [60, 365 * 5 + 5],
      ];
      for (const [code, days] of buckets) {
        if (spanDays <= days) {
          return code;
        }
      }
      return TEFASProvider.PERIYOD_MAX;
    }
    if (end && !start) {
      return TEFASProvider.PERIYOD_MAX;
    }
    return TEFASProvider.PERIOD_TO_PERIYOD[period] ?? 1;
  }

  /**
   * Get historical NAV (unit price) for a fund via `fonFiyatBilgiGetir` (v2 JSON API).
   * Maximum window is 5 years (`periyod=60`); explicit `start`/`end` ranges
   * are filtered client-side.
   */
  async getHistory(options: {
    fundCode: string;
    period?: string;
    start?: Date;
    end?: Date;
    fundType?: FundType;
  }): Promise<FundHistoryItem[]> {
    const { fundCode, period = "1mo", start, end } = options;
    const code = fundCode.toUpperCase();
    const periyod = this._resolvePeriyod(period, start, end);

    const cacheKey = `tefas:history:${code}:periyod=${periyod}`;
    let records = this.cache.get(cacheKey) as FundHistoryItem[] | undefined;

    if (!records) {
      let rows: Record<string, unknown>[];
      try {
        rows = await this._postJsonV2(
          "fonFiyatBilgiGetir",
          { fonKodu: code, dil: "TR", periyod },
          "fonFiyatBilgiGetir",
        );
      } catch (err) {
        if (err instanceof APIError) {
          throw new APIError(
            `Failed to fetch history for ${code}: ${err.message}`,
            err.statusCode,
          );
        }
        throw new APIError(
          `Failed to fetch history for ${code}: ${(err as Error).message}`,
        );
      }

      if (!rows || rows.length === 0) {
        throw new DataNotAvailableError(`No history for fund: ${code}`);
      }

      const parsed: FundHistoryItem[] = [];
      for (const row of rows) {
        const tarih = row.tarih;
        const fiyat = row.fiyat;
        if (!tarih || fiyat === null || fiyat === undefined) continue;

        const dateStr = String(tarih).slice(0, 10);
        const dt = new Date(`${dateStr}T00:00:00.000Z`);
        if (isNaN(dt.getTime())) continue;

        parsed.push({
          date: dt,
          price: Number(fiyat),
          // No longer returned by the TEFAS v2 API; preserved for compatibility.
          fundSize: NaN,
          investors: 0,
        });
      }

      parsed.sort((a, b) => a.date.getTime() - b.date.getTime());
      this.cache.set(cacheKey, parsed, TTL.OHLCV_HISTORY);
      records = parsed;
    }

    // Return a shallow copy with optional client-side date filtering
    let result = records.slice();
    if (start) {
      const startDateKey = this._formatDateISO(start);
      result = result.filter(
        (item) => this._formatDateISO(item.date) >= startDateKey,
      );
    }
    if (end) {
      const endDateKey = this._formatDateISO(end);
      result = result.filter(
        (item) => this._formatDateISO(item.date) <= endDateKey,
      );
    }

    if (result.length === 0) {
      throw new DataNotAvailableError(
        `No history for fund ${code} in requested range`,
      );
    }

    return result;
  }

  // --- Portfolio allocation (varlık dağılımı — dagilimSiraliGetirT) ---

  private _allocationPayload(
    fundCode: string,
    fundType: FundType,
    startYYYYMMDD: string,
    endYYYYMMDD: string,
  ): Record<string, unknown> {
    return {
      fonTipi: fundType,
      fonKodu: fundCode,
      aramaMetni: null,
      fonTurKod: null,
      fonGrubu: null,
      sfonTurKod: null,
      basTarih: startYYYYMMDD,
      bitTarih: endYYYYMMDD,
      basSira: 1,
      bitSira: 500,
      fonTurAciklama: null,
      dil: "TR",
      kurucuKod: null,
      sFonTurKod: "",
      fonKod: fundCode,
      fonGrup: "",
      fonUnvanTip: "",
    };
  }

  /**
   * Split a date range into consecutive windows <= 28 days (<= 1 month TEFAS cap).
   */
  static _allocationWindows(first: Date, last: Date): Array<[Date, Date]> {
    const windows: Array<[Date, Date]> = [];
    const spanMs = (TEFASProvider.ALLOCATION_MAX_WINDOW_DAYS - 1) * MS_PER_DAY;
    let cursor = new Date(first.getTime());
    const lastMs = last.getTime();

    while (cursor.getTime() <= lastMs) {
      const stopMs = Math.min(cursor.getTime() + spanMs, lastMs);
      const stop = new Date(stopMs);
      windows.push([new Date(cursor.getTime()), stop]);
      cursor = new Date(stopMs + MS_PER_DAY);
    }
    return windows;
  }

  /**
   * Convert one `dagilimSiraliGetirT` response row into per-asset records.
   *
   * Zero and null columns are dropped; negative weights (e.g. leveraged repo
   * legs) are preserved. Unverified codes surface with `asset_type: null` and
   * `asset_name: null`.
   */
  static _allocationRows(row: Record<string, unknown>): AllocationItem[] {
    const rawDate = row.tarih ? String(row.tarih).slice(0, 10) : "";
    let stamp = rawDate ? new Date(`${rawDate}T00:00:00.000Z`) : new Date();
    if (isNaN(stamp.getTime())) {
      stamp = new Date();
    }

    const records: AllocationItem[] = [];
    for (const [code, value] of Object.entries(row)) {
      if (TEFASProvider.ALLOCATION_META.has(code)) continue;
      if (value === null || value === undefined || value === "" || value === 0)
        continue;

      const weight = Number(value);
      if (isNaN(weight) || weight === 0) continue;

      const label = ASSET_TYPE_LABELS[code] ?? null;
      records.push({
        date: stamp,
        code,
        asset_type: label,
        asset_name: label ? (ASSET_NAME_STANDARDIZATION[label] ?? null) : null,
        weight,
      });
    }
    return records;
  }

  /**
   * Get portfolio allocation (asset breakdown) for a fund via `dagilimSiraliGetirT`.
   */
  async getAllocation(
    fundCode: string,
    start?: Date,
    end?: Date,
    fundType?: FundType,
  ): Promise<AllocationItem[]> {
    const code = fundCode.toUpperCase().trim();
    const hasExplicitStart = start !== undefined;

    let windows: Array<[Date, Date]>;
    if (start) {
      const last = end || new Date();
      if (last.getTime() < start.getTime()) {
        throw new Error(
          `end ${last.toISOString()} is before start ${start.toISOString()}`,
        );
      }
      windows = TEFASProvider._allocationWindows(start, last);
    } else {
      // Look back 7 days to cover weekends/holidays, then keep newest date.
      const today = new Date();
      windows = [[new Date(today.getTime() - 7 * MS_PER_DAY), today]];
    }

    const firstStartStr = this._formatDateCompact(windows[0][0]);
    const lastEndStr = this._formatDateCompact(windows[windows.length - 1][1]);
    const cacheKey = `tefas:allocation:${code}:${fundType || "auto"}:${firstStartStr}:${lastEndStr}:${hasExplicitStart}`;
    const cached = this.cache.get(cacheKey) as AllocationItem[] | undefined;
    if (cached) return cached.slice();

    const candidates: readonly FundType[] = fundType
      ? [fundType.toUpperCase() as FundType]
      : TEFASProvider.ALLOCATION_FUND_TYPES;

    const [headStart, headEnd] = windows[0];
    let resolvedType: FundType | null = null;
    let raw: Record<string, unknown>[] = [];

    try {
      // Resolve fund universe on the first window only to stay under TEFAS rate limits.
      for (const candidate of candidates) {
        const found = await this._postJsonV2(
          TEFASProvider.ALLOCATION_ENDPOINT,
          this._allocationPayload(
            code,
            candidate,
            this._formatDateCompact(headStart),
            this._formatDateCompact(headEnd),
          ),
          TEFASProvider.ALLOCATION_ENDPOINT,
          3,
          { errorsAsEmpty: [TEFASProvider.ALLOCATION_NO_MATCH] },
        );
        if (found.length > 0) {
          resolvedType = candidate;
          raw = found;
          break;
        }
      }

      if (resolvedType === null) {
        throw new DataNotAvailableError(
          `TEFAS published no portfolio allocation for '${code}' ` +
            `(fund types tried: ${candidates.join(", ")})`,
        );
      }

      for (const [wStart, wEnd] of windows.slice(1)) {
        const more = await this._postJsonV2(
          TEFASProvider.ALLOCATION_ENDPOINT,
          this._allocationPayload(
            code,
            resolvedType,
            this._formatDateCompact(wStart),
            this._formatDateCompact(wEnd),
          ),
          TEFASProvider.ALLOCATION_ENDPOINT,
          3,
          { errorsAsEmpty: [TEFASProvider.ALLOCATION_NO_MATCH] },
        );
        raw.push(...more);
      }

      if (!hasExplicitStart && raw.length > 1) {
        // Snapshot mode: keep only the newest published date.
        let newest = raw[0];
        for (const item of raw.slice(1)) {
          if (String(item.tarih || "") > String(newest.tarih || "")) {
            newest = item;
          }
        }
        raw = [newest];
      }

      const records: AllocationItem[] = [];
      for (const row of raw) {
        records.push(...TEFASProvider._allocationRows(row));
      }

      if (records.length === 0) {
        throw new DataNotAvailableError(
          `No allocation rows for fund ${code} in requested range`,
        );
      }

      // Date ascending, magnitude (|weight|) descending within each date
      records.sort((a, b) => {
        const diff = a.date.getTime() - b.date.getTime();
        if (diff !== 0) return diff;
        return Math.abs(b.weight) - Math.abs(a.weight);
      });

      this.cache.set(cacheKey, records, TTL.FX_RATES);
      return records.slice();
    } catch (err) {
      if (err instanceof DataNotAvailableError) throw err;
      if (err instanceof APIError) throw err;
      throw new APIError(
        `Failed to fetch allocation for ${code}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Get historical allocation data for a fund.
   */
  async getAllocationHistory(options: {
    fundCode: string;
    period?: string;
    start?: Date;
    end?: Date;
    fundType?: FundType;
  }): Promise<AllocationItem[]> {
    const { fundCode, period = "1mo", start, end, fundType } = options;

    const last = end || new Date();
    let first: Date;

    if (start) {
      first = start;
    } else {
      const spans: Record<string, number> = {
        "1w": 7,
        "1mo": 30,
        "2mo": 61,
        "3mo": 91,
      };
      if (!(period in spans)) {
        throw new Error(
          `period must be one of ${Object.keys(spans).sort().join(", ")}, got ${JSON.stringify(period)}. ` +
            "TEFAS rate limits beyond roughly three months per call; pass explicit start/end and page through for more.",
        );
      }
      first = new Date(last.getTime() - spans[period] * MS_PER_DAY);
    }

    const diffDays = Math.floor(
      (last.getTime() - first.getTime()) / MS_PER_DAY,
    );
    if (diffDays > 91) {
      throw new Error(
        `allocationHistory covers at most ~3 months per call (${diffDays} days requested). ` +
          "TEFAS caps each query at one month and rate limits after four; call repeatedly with consecutive windows for longer spans.",
      );
    }

    return this.getAllocation(fundCode, first, last, fundType);
  }

  /**
   * Search for funds by name or code.
   */
  async search(
    query: string,
    limit: number = 20,
  ): Promise<
    Array<{
      fund_code: string;
      name: string;
      fund_type: string;
      return_1y?: number;
    }>
  > {
    try {
      const results = await this._postJsonV2(
        "fonUnvanAra",
        { aranan: query },
        "fonUnvanAra",
      );

      const matching: Array<{
        fund_code: string;
        name: string;
        fund_type: string;
        return_1y?: number;
      }> = [];
      for (const fund of results) {
        matching.push({
          fund_code: (fund.fonKodu as string) || "",
          name: (fund.fonUnvan as string) || "",
          fund_type: "",
          return_1y: undefined,
        });

        if (matching.length >= limit) break;
      }
      return matching;
    } catch (err) {
      throw new APIError(`Search failed: ${(err as Error).message}`);
    }
  }

  /**
   * Screen/filter funds by return thresholds and other criteria.
   */
  async screenFunds(
    options: ScreenFundsOptions = {},
  ): Promise<ScreenFundResult[]> {
    const {
      fundType = "YAT",
      founder,
      minReturn1m,
      minReturn3m,
      minReturn6m,
      minReturnYtd,
      minReturn1y,
      minReturn3y,
      minReturn5y,
      limit = 50,
    } = options;

    try {
      const allFunds = await this._postJsonV2(
        "fonGetiriBazliBilgiGetir",
        {
          fonTipi: fundType,
          dil: "TR",
          calismaTipi: 2,
          donemGetiri1a: "1",
          donemGetiri3a: "1",
          donemGetiri6a: "1",
          donemGetiriyb: "1",
          donemGetiri1y: "1",
          donemGetiri3y: "1",
          donemGetiri5y: "1",
        },
        "fonGetiriBazliBilgiGetir",
      );

      const filtered: ScreenFundResult[] = [];
      for (const fund of allFunds) {
        if (founder && (fund.kurucuKod as string) !== founder) continue;

        const r1m = fund.getiri1a as number | undefined;
        const r3m = fund.getiri3a as number | undefined;
        const r6m = fund.getiri6a as number | undefined;
        const rytd = fund.getiriyb as number | undefined;
        const r1y = fund.getiri1y as number | undefined;
        const r3y = fund.getiri3y as number | undefined;
        const r5y = fund.getiri5y as number | undefined;

        if (
          minReturn1m !== undefined &&
          (r1m === undefined || r1m < minReturn1m)
        )
          continue;
        if (
          minReturn3m !== undefined &&
          (r3m === undefined || r3m < minReturn3m)
        )
          continue;
        if (
          minReturn6m !== undefined &&
          (r6m === undefined || r6m < minReturn6m)
        )
          continue;
        if (
          minReturnYtd !== undefined &&
          (rytd === undefined || rytd < minReturnYtd)
        )
          continue;
        if (
          minReturn1y !== undefined &&
          (r1y === undefined || r1y < minReturn1y)
        )
          continue;
        if (
          minReturn3y !== undefined &&
          (r3y === undefined || r3y < minReturn3y)
        )
          continue;
        if (
          minReturn5y !== undefined &&
          (r5y === undefined || r5y < minReturn5y)
        )
          continue;

        filtered.push({
          fund_code: (fund.fonKodu as string) || "",
          name: (fund.fonUnvan as string) || "",
          fund_type: (fund.fonTurAciklama as string) || "",
          return_1m: r1m,
          return_3m: r3m,
          return_6m: r6m,
          return_ytd: rytd,
          return_1y: r1y,
          return_3y: r3y,
          return_5y: r5y,
        });
      }

      // Sort by 1-year return descending, then YTD descending
      filtered.sort((a, b) => {
        const keyA: [number, number] =
          a.return_1y !== undefined && a.return_1y !== null
            ? [1, a.return_1y]
            : a.return_ytd !== undefined && a.return_ytd !== null
              ? [0, a.return_ytd]
              : [-1, 0];
        const keyB: [number, number] =
          b.return_1y !== undefined && b.return_1y !== null
            ? [1, b.return_1y]
            : b.return_ytd !== undefined && b.return_ytd !== null
              ? [0, b.return_ytd]
              : [-1, 0];
        if (keyB[0] !== keyA[0]) return keyB[0] - keyA[0];
        return keyB[1] - keyA[1];
      });

      return filtered.slice(0, limit);
    } catch (err) {
      throw new APIError(`Screen funds failed: ${(err as Error).message}`);
    }
  }

  /**
   * Parse Turkish decimal string (comma as decimal separator) to number.
   */
  static parseTurkishDecimal(value: string | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    if (!s) return null;
    try {
      const num = parseFloat(s.replace(",", "."));
      return isNaN(num) ? null : num;
    } catch {
      return null;
    }
  }

  /**
   * Get management fee data for funds.
   */
  async getManagementFees(
    fundType: FundType = "YAT",
    founder?: string,
  ): Promise<
    Array<{
      fund_code: string;
      name: string;
      fund_category: string;
      founder_code: string;
      applied_fee: number | null;
      prospectus_fee: number | null;
      max_expense_ratio: number | null;
      annual_return: number | null;
    }>
  > {
    try {
      const allFunds = await this._postJsonV2(
        "fonYonetimBazliBilgiGetir",
        { fonTipi: fundType, dil: "TR" },
        "fonYonetimBazliBilgiGetir",
      );

      const funds: Array<{
        fund_code: string;
        name: string;
        fund_category: string;
        founder_code: string;
        applied_fee: number | null;
        prospectus_fee: number | null;
        max_expense_ratio: number | null;
        annual_return: number | null;
      }> = [];

      for (const fund of allFunds) {
        if (founder && (fund.kurucuKod as string) !== founder) continue;

        funds.push({
          fund_code: (fund.fonKodu as string) || "",
          name: (fund.fonUnvan as string) || "",
          fund_category: (fund.fonTurAciklama as string) || "",
          founder_code: (fund.kurucuKod as string) || "",
          applied_fee: TEFASProvider.parseTurkishDecimal(
            fund.uygulananYu1Y as string,
          ),
          prospectus_fee: TEFASProvider.parseTurkishDecimal(
            fund.fonIcTuzukYu1G as string,
          ),
          max_expense_ratio: TEFASProvider.parseTurkishDecimal(
            fund.fonTopGiderKesoran as string,
          ),
          annual_return:
            fund.yillikGetiri !== null && fund.yillikGetiri !== undefined
              ? Number(fund.yillikGetiri)
              : null,
        });
      }

      return funds;
    } catch (err) {
      throw new APIError(
        `Failed to fetch management fees: ${(err as Error).message}`,
      );
    }
  }

  private _formatDateISO(date: Date): string {
    return date.toISOString().split("T")[0];
  }

  private _formatDateCompact(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}${m}${d}`;
  }
}

// Singleton
let provider: TEFASProvider | null = null;
export function getTEFASProvider(): TEFASProvider {
  if (!provider) {
    provider = new TEFASProvider();
  }
  return provider;
}
