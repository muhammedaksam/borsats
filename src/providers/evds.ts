/* eslint-disable @typescript-eslint/no-explicit-any */
import { format, parse } from "date-fns";

import { APIError } from "~/exceptions";
import { BaseProvider } from "~/providers/base";

// --- API Key Management ---
let globalApiKey: string | null = null;

export function setEVDSKey(key: string): void {
  if (!key || typeof key !== "string") {
    throw new Error("EVDS API key must be a non-empty string");
  }
  globalApiKey = key.trim();
  // Clear the singleton to recreate the client with the new key headers
  evdsProviderInstance = null;
}

export function clearEVDSKey(): void {
  globalApiKey = null;
  evdsProviderInstance = null;
}

export function getEVDSKey(): string | null {
  if (globalApiKey) return globalApiKey;
  if (typeof process !== "undefined" && process.env.EVDS_API_KEY) {
    return process.env.EVDS_API_KEY.trim();
  }
  return null;
}

// --- Constants ---
export const BASE_URL = "https://evds3.tcmb.gov.tr";
export const API_PREFIX = "/igmevdsms-dis";

export const FREQUENCY: Record<string, number> = {
  daily: 1,
  workday: 2,
  weekly: 3,
  biweekly: 4,
  monthly: 5,
  quarterly: 6,
  semiannual: 7,
  annual: 8,
};

export const NUMERIC_FREQ_NORMALIZE: Record<number, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 5,
  13: 6,
  16: 7,
  18: 8,
};

export const AGGREGATION = ["avg", "min", "max", "first", "last", "sum"];

export const FORMULA: Record<string, [string, string]> = {
  level: ["0", "Düzey"],
  pct_change: ["1", "Önceki Döneme Göre Yüzde Değişim"],
  diff: ["2", "Önceki Döneme Göre Fark"],
  yoy_pct: ["3", "Yıllık Yüzde Değişim"],
  yoy_diff: ["4", "Yıllık Fark"],
  moving_avg: ["5", "Hareketli Ortalama"],
  moving_sum: ["6", "Hareketli Toplam"],
  yoy_moving_pct: ["7", "Yıllık Hareketli Yüzde Değişim"],
  yoy_moving_diff: ["8", "Yıllık Hareketli Fark"],
};

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
  Origin: BASE_URL,
  Referer: `${BASE_URL}/tumSeriler`,
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
};

// --- Helpers ---
export function normalizeCode(code: string): string {
  return code.replace(/\./g, "_");
}

export function denormalizeCode(code: string): string {
  return code.replace(/_/g, ".");
}

export function formatEVDSDate(value: string | Date): string {
  if (value instanceof Date) {
    return format(value, "dd-MM-yyyy");
  }

  if (typeof value === "string") {
    // Try to parse common formats
    const formatsToTry = [
      "yyyy-MM-dd",
      "dd-MM-yyyy",
      "dd.MM.yyyy",
      "yyyy/MM/dd",
    ];
    for (const fmt of formatsToTry) {
      try {
        const parsed = parse(value, fmt, new Date());
        if (!isNaN(parsed.getTime())) {
          return format(parsed, "dd-MM-yyyy");
        }
      } catch {
        // Continue to next format
      }
    }
    // If it already looks like dd-MM-yyyy, just return it
    if (/^\d{2}-\d{2}-\d{4}$/.test(value)) return value;

    throw new Error(
      `Could not parse date '${value}'. Use YYYY-MM-DD or DD-MM-YYYY.`,
    );
  }

  throw new Error(`Unsupported date value: ${value}`);
}

const OBS_PER_DAY: Record<number, number> = {
  1: 1.0,
  2: 5.0 / 7.0,
  3: 1.0 / 7.0,
  4: 1.0 / 14.0,
  5: 1.0 / 30.0,
  6: 1.0 / 91.0,
  7: 1.0 / 182.0,
  8: 1.0 / 365.0,
};

export function estimateObservations(
  startStr: string,
  endStr: string,
  freqInt: number,
): number {
  const startDt = parse(startStr, "dd-MM-yyyy", new Date());
  const endDt = parse(endStr, "dd-MM-yyyy", new Date());
  const days =
    Math.max(0, (endDt.getTime() - startDt.getTime()) / (1000 * 60 * 60 * 24)) +
    1;
  const rate = OBS_PER_DAY[freqInt] || 1.0;
  return Math.floor(days * rate) + 1;
}

export function splitWindow(
  startStr: string,
  endStr: string,
  freqInt: number,
  maxObs: number,
): [string, string][] {
  const startDt = parse(startStr, "dd-MM-yyyy", new Date());
  const endDt = parse(endStr, "dd-MM-yyyy", new Date());
  const rate = OBS_PER_DAY[freqInt] || 1.0;
  const safety = Math.max(0.9, 1.0 - 50 / maxObs);
  const daysPerChunk = Math.max(1, Math.floor((maxObs * safety) / rate));

  const windows: [string, string][] = [];
  let cursor = new Date(startDt);

  while (cursor <= endDt) {
    let chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + daysPerChunk - 1);
    if (chunkEnd > endDt) chunkEnd = new Date(endDt);

    windows.push([
      format(cursor, "dd-MM-yyyy"),
      format(chunkEnd, "dd-MM-yyyy"),
    ]);
    cursor = new Date(chunkEnd);
    cursor.setDate(cursor.getDate() + 1);
  }
  return windows;
}

export function mergeChunks(chunks: any[]): any {
  if (!chunks || chunks.length === 0) return { totalCount: 0, items: [] };

  const mergedItems: any[] = [];
  const seenDates = new Set<string>();

  for (const chunk of chunks) {
    if (!chunk || typeof chunk !== "object") continue;
    const c = chunk as any;
    const items = (c.items as any[]) || (c.data as any[]) || [];
    for (const item of items) {
      const tarih = (item.Tarih || item.TARIH || "") as string;
      if (tarih && seenDates.has(tarih)) continue;
      if (tarih) seenDates.add(tarih);
      mergedItems.push(item);
    }
  }

  return { totalCount: mergedItems.length, items: mergedItems };
}

export function periodToDates(period: string): [string, string] {
  const p = (period || "1y").toLowerCase().trim();
  const end = new Date();
  let start = new Date();

  if (p === "ytd") {
    start.setMonth(0, 1);
  } else if (p === "1d") start.setDate(end.getDate() - 1);
  else if (p === "5d") start.setDate(end.getDate() - 5);
  else if (p === "1w") start.setDate(end.getDate() - 7);
  else if (p === "1mo") start.setMonth(end.getMonth() - 1);
  else if (p === "3mo") start.setMonth(end.getMonth() - 3);
  else if (p === "6mo") start.setMonth(end.getMonth() - 6);
  else if (p === "1y") start.setFullYear(end.getFullYear() - 1);
  else if (p === "2y") start.setFullYear(end.getFullYear() - 2);
  else if (p === "3y") start.setFullYear(end.getFullYear() - 3);
  else if (p === "5y") start.setFullYear(end.getFullYear() - 5);
  else if (p === "10y") start.setFullYear(end.getFullYear() - 10);
  else if (p === "max") start.setFullYear(end.getFullYear() - 80);
  else
    throw new Error(
      `Invalid period '${period}'. Valid: 1d, 5d, 1w, 1mo, 3mo, 6mo, 1y, 2y, 3y, 5y, 10y, max, ytd`,
    );

  return [formatEVDSDate(start), formatEVDSDate(end)];
}

// --- Provider ---
export class EVDSProvider extends BaseProvider {
  public static readonly MAX_SERIES_PER_CALL = 400;
  public static readonly MAX_OBSERVATIONS_PER_CALL = 1000;

  private sessionWarmed = false;

  constructor() {
    super({
      baseUrl: BASE_URL,
      timeout: 60000,
    });

    // @ts-ignore - access protected client
    this.client.defaults.headers = {
      ...this.client.defaults.headers,
      ...BROWSER_HEADERS,
    };

    const key = getEVDSKey();
    if (key) {
      // @ts-ignore
      this.client.defaults.headers["key"] = key;
    }
  }

  public get hasApiKey(): boolean {
    // @ts-ignore
    return !!this.client.defaults.headers["key"];
  }

  private async warmSession(): Promise<void> {
    if (this.sessionWarmed) return;
    try {
      await this.client.get(`${BASE_URL}/tumSeriler`);
      await this.client.get(
        `${BASE_URL}${API_PREFIX}/genel-ayarlar/multiple?keys=MAX_SERIE_COUNT,MAX_GRID_COUNT`,
      );
    } catch {
      // Ignore warm-up errors
    }
    this.sessionWarmed = true;
  }

  private apiPath(path: string): string {
    return `${API_PREFIX}${path}`;
  }

  // --- Official REST catalogue endpoints (key required) ---
  public async getCategoriesRest(): Promise<any[]> {
    if (!this.hasApiKey)
      throw new APIError("getCategoriesRest requires an API key");
    const data = await this.request<any>(this.apiPath("/categories/type=json"));
    return Array.isArray(data) ? data : [];
  }

  public async getDatagroupsRest(datagroupCode?: string): Promise<any[]> {
    if (!this.hasApiKey)
      throw new APIError("getDatagroupsRest requires an API key");
    const url = datagroupCode
      ? this.apiPath(`/datagroups/mode=1&code=${datagroupCode}&type=json`)
      : this.apiPath("/datagroups/mode=0&type=json");
    const data = await this.request<any>(url);
    return Array.isArray(data) ? data : [];
  }

  public async getSeriesListRest(code: string): Promise<any[]> {
    if (!this.hasApiKey)
      throw new APIError("getSeriesListRest requires an API key");
    const data = await this.request<any>(
      this.apiPath(`/serieList/type=json&code=${code}`),
    );
    return Array.isArray(data) ? data : [];
  }

  // --- Catalogue: categories + datagroups (anonymous GET) ---
  public async getCategories(): Promise<any[]> {
    const data = await this.request<any>(
      this.apiPath("/categories/withDatagroups/type=json"),
    );
    if (!Array.isArray(data))
      throw new APIError(`Unexpected EVDS categories response: ${typeof data}`);
    return data;
  }

  public async getSeriesList(datagroupCode: string): Promise<any[]> {
    if (!datagroupCode) throw new Error("datagroupCode is required");
    const data = await this.request<any>(
      this.apiPath(`/serieList/fe/type=json&code=${datagroupCode}`),
    );
    if (!Array.isArray(data))
      throw new APIError(`Unexpected serieList response: ${typeof data}`);
    return data;
  }

  public async getSettings(...keys: string[]): Promise<Record<string, string>> {
    if (keys.length === 0)
      throw new Error("at least one settings key is required");
    const url =
      keys.length === 1
        ? this.apiPath(`/genel-ayarlar?key=${keys[0]}`)
        : this.apiPath(`/genel-ayarlar/multiple?keys=${keys.join(",")}`);

    const payload = await this.request<any>(url);
    const out: Record<string, string> = {};

    if (
      payload &&
      typeof payload === "object" &&
      "key" in payload &&
      !Array.isArray(payload)
    ) {
      out[payload.key as string] = payload.value || "";
    } else if (Array.isArray(payload)) {
      for (const item of payload) {
        if (item && typeof item === "object" && "key" in item) {
          out[item.key as string] = item.value || "";
        }
      }
    }
    return out;
  }

  public async getDashboard(slug: string): Promise<any> {
    if (!slug) throw new Error("dashboard slug is required");
    return this.request<any>(this.apiPath(`/dashboards/${slug}`));
  }

  public async getHomePageDashboards(): Promise<any[]> {
    const data = await this.request<any>(
      this.apiPath("/dashboards/home-page-dashboards"),
    );
    return Array.isArray(data) ? data : [];
  }

  public async getDashboardByEncodedId(encodedId: string): Promise<any> {
    if (!encodedId) throw new Error("encodedId is required");
    return this.request<any>(
      this.apiPath(`/public/dashboards/portlet/${encodedId}`),
    );
  }

  public async searchServer(term: string): Promise<any> {
    if (!term || typeof term !== "string")
      throw new Error("search term is required");
    return this.request<any>(
      this.apiPath(
        `/searchResults?searchVal=${encodeURIComponent(term.trim())}`,
      ),
    );
  }

  public async getAnnouncements(): Promise<any[]> {
    const data = await this.request<any>(this.apiPath("/announcements"));
    const p = data as any;
    return Array.isArray(data)
      ? data
      : Array.isArray(p?.data)
        ? (p.data as any[])
        : [];
  }

  // --- Catalogue lookups ---
  public async findDatagroup(datagroupCode: string): Promise<any | null> {
    const categories = await this.getCategories();
    for (const cat of categories) {
      for (const dg of cat.DATAGROUPS || []) {
        if (dg.DATAGROUP_CODE === datagroupCode) {
          return { ...dg, _category: cat };
        }
      }
    }
    return null;
  }

  public async findSeries(seriesCode: string): Promise<any | null> {
    const targetDot = denormalizeCode(seriesCode).toUpperCase();

    // We'll cache this lookup client-side
    const cacheKey = `evds:series_lookup:${targetDot}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const categories = await this.getCategories();
    for (const cat of categories) {
      for (const dg of cat.DATAGROUPS || []) {
        const dgCode = dg.DATAGROUP_CODE;
        if (!dgCode) continue;
        const seriesList = await this.getSeriesList(dgCode);
        for (const serie of seriesList) {
          const raw = serie.SERIE_CODE || "";
          if (denormalizeCode(raw).toUpperCase() === targetDot) {
            const out = { ...serie, _datagroup: dg, _category: cat };
            this.cache.set(cacheKey, out, 3600); // 1h cache
            return out;
          }
        }
      }
    }
    return null;
  }

  // --- Time-series data ---
  private async postJson(path: string, body: any): Promise<any> {
    await this.warmSession();
    try {
      const response = await this.client.post(this.apiPath(path), body, {
        headers: { "Content-Type": "application/json;charset=UTF-8" },
      });
      return response.data;
    } catch {
      // Add a simple retry
      this.sessionWarmed = false;
      await this.warmSession();
      const response = await this.client.post(this.apiPath(path), body, {
        headers: { "Content-Type": "application/json;charset=UTF-8" },
      });
      return response.data;
    }
  }

  public async getSeriesRange(
    seriesCodes: string[],
    datagroupCodes?: string[],
    frequency: string | number = "monthly",
  ): Promise<Record<string, { start: string; end: string }>> {
    if (!seriesCodes || seriesCodes.length === 0)
      throw new Error("at least one series code is required");
    const normalized = seriesCodes.map(normalizeCode);

    if (!datagroupCodes) {
      datagroupCodes = [];
      for (const code of seriesCodes) {
        const located = await this.findSeries(code);
        if (located && located._datagroup) {
          datagroupCodes.push(located._datagroup.DATAGROUP_CODE || "");
        } else {
          datagroupCodes.push("");
        }
      }
    }

    const freqInt = this.resolveFrequency(frequency);
    const body = {
      frequency: freqInt,
      series: normalized,
      datagroups: datagroupCodes,
    };

    try {
      const data = await this.postJson("/serieList/baslangicBitis", body);
      const out: Record<string, { start: string; end: string }> = {};

      if (Array.isArray(data)) {
        for (const entry of data) {
          if (!entry || typeof entry !== "object") continue;
          const code = entry.SERIE_CODE || entry.serieCode;
          if (!code) continue;
          out[code.toUpperCase()] = {
            start:
              entry.START_DATE || entry.startDate || entry.BASLANGIC_TARIHI,
            end: entry.END_DATE || entry.endDate || entry.BITIS_TARIHI,
          };
        }
      } else if (data && typeof data === "object") {
        const topStart = data.startDate || data.START_DATE;
        const topEnd = data.endDate || data.END_DATE;
        if (topStart && topEnd && normalized.length === 1) {
          out[normalized[0].toUpperCase()] = { start: topStart, end: topEnd };
        }
        const items = data.data || data.items || [];
        for (const entry of items) {
          if (!entry || typeof entry !== "object") continue;
          const code = entry.SERIE_CODE || entry.serieCode;
          if (!code) continue;
          out[code.toUpperCase()] = {
            start:
              entry.START_DATE || entry.startDate || entry.BASLANGIC_TARIHI,
            end: entry.END_DATE || entry.endDate || entry.BITIS_TARIHI,
          };
        }
      }
      return out;
    } catch {
      return {};
    }
  }

  public resolveFrequency(freq: number | string): number {
    if (typeof freq === "number") return NUMERIC_FREQ_NORMALIZE[freq] || freq;
    const s = freq.trim().toLowerCase();
    if (FREQUENCY[s]) return FREQUENCY[s];
    const n = parseInt(s, 10);
    if (!isNaN(n)) return NUMERIC_FREQ_NORMALIZE[n] || n;
    throw new Error(
      `Invalid frequency '${freq}'. Use one of ${Object.keys(FREQUENCY)} or an integer 1..8.`,
    );
  }

  public resolveFormula(formula: string | number): [string, string] {
    if (typeof formula === "string" && FORMULA[formula])
      return FORMULA[formula];
    const fStr = String(formula);
    for (const val of Object.values(FORMULA)) {
      if (val[0] === fStr) return val;
    }
    throw new Error(
      `Invalid formula '${formula}'. Use one of ${Object.keys(FORMULA)} or a string ID 0..8.`,
    );
  }

  private async restDataGet(
    orderedParams: [string, string][],
    outputFormat = "json",
  ): Promise<any> {
    const path =
      "/" +
      orderedParams
        .filter(([, v]) => v !== "")
        .map(([k, v]) => `${k}=${v}`)
        .join("&");

    // We cannot use standard base request here properly because axios turns /path=value into /?path=value
    // So we need to make the request to absolute URL or configure axios properly
    const url = this.apiPath(path);
    try {
      const response = await this.client.get(url, {
        responseType: outputFormat === "json" ? "json" : "text",
      });
      return response.data;
    } catch (err) {
      const e = err as { response?: { status?: number }; message: string };
      const status = e.response?.status;
      if (status === 401 || status === 403) {
        throw new APIError(
          "EVDS REST: HTTP 401/403 (key invalid or missing). Re-check the key at https://evds3.tcmb.gov.tr",
          status,
        );
      }
      throw new APIError(`EVDS REST request failed: ${e.message}`, status);
    }
  }

  public async getSeriesDataRest(
    codesStr: string,
    startStr: string,
    endStr: string,
    freqInt: number,
    aggStr: string,
    formulasStr: string,
    decimals: number,
    dateFormat: number,
    outputFormat = "json",
    decimalSeparator = ".",
  ): Promise<any> {
    const parts: [string, string][] = [
      ["series", codesStr],
      ["startDate", startStr],
      ["endDate", endStr],
      ["type", outputFormat],
    ];
    if (freqInt) parts.push(["frequency", String(freqInt)]);
    if (aggStr) parts.push(["aggregationTypes", aggStr]);
    if (formulasStr) parts.push(["formulas", formulasStr]);
    parts.push(["decimalSeperator", decimalSeparator]);
    parts.push(["decimal", String(decimals)]);
    parts.push(["dateFormat", String(dateFormat)]);

    return this.restDataGet(parts, outputFormat);
  }

  public async getSeriesData(
    seriesCodes: string[] | string,
    start: string | Date,
    end: string | Date,
    frequency: string | number = "monthly",
    aggregation: string | string[] = "avg",
    formula: string | string[] = "level",
    decimals: number = 2,
    dateFormat: number = 0,
    outputFormat: string = "json",
    decimalSeparator: string = ".",
  ): Promise<any> {
    if (!this.hasApiKey) {
      throw new APIError(
        "EVDS time-series fetch requires an API key. Get a free key at https://evds3.tcmb.gov.tr and configure with bp.setEVDSKey(<key>).",
      );
    }

    const codes = Array.isArray(seriesCodes) ? seriesCodes : [seriesCodes];
    if (codes.length === 0)
      throw new Error("at least one series code is required");
    if (codes.length > EVDSProvider.MAX_SERIES_PER_CALL) {
      throw new Error(
        `max ${EVDSProvider.MAX_SERIES_PER_CALL} series per call (got ${codes.length})`,
      );
    }

    const normalized = codes.map(denormalizeCode);
    const codesStr = normalized.join("-");
    const n = normalized.length;

    const aggs = Array.isArray(aggregation)
      ? aggregation.map((a) => a.toLowerCase())
      : Array(n).fill(aggregation.toLowerCase());
    if (aggs.length !== n)
      throw new Error(
        `aggregation list length (${aggs.length}) must match series count (${n})`,
      );
    for (const agg of aggs) {
      if (!AGGREGATION.includes(agg))
        throw new Error(
          `Invalid aggregation '${agg}'. Use one of ${AGGREGATION}`,
        );
    }
    const aggStr = aggs.join("-");

    const formulaInputs = Array.isArray(formula)
      ? formula
      : Array(n).fill(formula);
    if (formulaInputs.length !== n)
      throw new Error(
        `formula list length (${formulaInputs.length}) must match series count (${n})`,
      );
    const formulaIds = formulaInputs.map((f) => this.resolveFormula(f)[0]);
    const formulasStr = formulaIds.join("-");

    const freqInt = this.resolveFrequency(frequency);
    const startStr = formatEVDSDate(start);
    const endStr = formatEVDSDate(end);

    if (outputFormat !== "json") {
      return this.getSeriesDataRest(
        codesStr,
        startStr,
        endStr,
        freqInt,
        aggStr,
        formulasStr,
        decimals,
        dateFormat,
        outputFormat,
        decimalSeparator,
      );
    }

    let obsEstimate = 0;
    try {
      obsEstimate = estimateObservations(startStr, endStr, freqInt);
    } catch {
      obsEstimate = 0;
    }

    if (obsEstimate > EVDSProvider.MAX_OBSERVATIONS_PER_CALL) {
      const windows = splitWindow(
        startStr,
        endStr,
        freqInt,
        EVDSProvider.MAX_OBSERVATIONS_PER_CALL,
      );
      const chunks: any[] = [];
      for (const [wStart, wEnd] of windows) {
        const part = await this.getSeriesDataRest(
          codesStr,
          wStart,
          wEnd,
          freqInt,
          aggStr,
          formulasStr,
          decimals,
          dateFormat,
          outputFormat,
          decimalSeparator,
        );
        chunks.push(part);
      }
      return mergeChunks(chunks);
    } else {
      return this.getSeriesDataRest(
        codesStr,
        startStr,
        endStr,
        freqInt,
        aggStr,
        formulasStr,
        decimals,
        dateFormat,
        outputFormat,
        decimalSeparator,
      );
    }
  }

  public async getDatagroupData(
    datagroupCode: string,
    start: string | Date,
    end: string | Date,
    frequency?: string | number,
    decimals: number = 2,
  ): Promise<any> {
    if (!this.hasApiKey) {
      throw new APIError("EVDS datagroup data fetch requires an API key.");
    }
    if (!datagroupCode) throw new Error("datagroupCode is required");

    const startStr = formatEVDSDate(start);
    const endStr = formatEVDSDate(end);
    const freqInt =
      frequency !== undefined ? this.resolveFrequency(frequency) : undefined;

    const parts: [string, string][] = [
      ["datagroup", datagroupCode],
      ["startDate", startStr],
      ["endDate", endStr],
      ["type", "json"],
    ];
    if (freqInt) parts.push(["frequency", String(freqInt)]);
    parts.push(["decimalSeperator", "."]);
    parts.push(["decimal", String(decimals)]);

    return this.restDataGet(parts, "json");
  }
}

let evdsProviderInstance: EVDSProvider | null = null;

export function getEVDSProvider(): EVDSProvider {
  if (!evdsProviderInstance) {
    evdsProviderInstance = new EVDSProvider();
  }
  return evdsProviderInstance;
}
