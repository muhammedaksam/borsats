/* eslint-disable @typescript-eslint/no-explicit-any */
import { APIError } from "~/exceptions";
import {
  AGGREGATION,
  clearEVDSKey,
  denormalizeCode,
  EVDSProvider,
  formatEVDSDate,
  FORMULA,
  FREQUENCY,
  getEVDSKey,
  getEVDSProvider,
  normalizeCode,
  periodToDates,
  setEVDSKey,
} from "~/providers/evds";

// --- Date Helper ---
function resolveWindow(
  period?: string,
  start?: string | Date,
  end?: string | Date,
): [string, string] {
  if (start || end) {
    const startStr = start ? formatEVDSDate(start) : "01-01-1950";
    const endStr = end ? formatEVDSDate(end) : "01-01-2999";
    return [startStr, endStr];
  }
  return periodToDates(period || "1y");
}

function parseEVDSDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;

  // DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [d, m, y] = s.split("-");
    return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(s);
  }
  // YYYY-MM
  if (/^\d{4}-\d{2}$/.test(s)) {
    return new Date(`${s}-01`);
  }
  // YYYY
  if (/^\d{4}$/.test(s)) {
    return new Date(`${s}-01-01`);
  }
  // Quarter 2024-Q1 or 2024Q1
  const qMatch = s.match(/^(\d{4})-?Q([1-4])$/i);
  if (qMatch) {
    const year = parseInt(qMatch[1]);
    const quarter = parseInt(qMatch[2]);
    const month = (quarter - 1) * 3;
    return new Date(year, month, 1);
  }

  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function frameFromPayload(payload: any, seriesCodes: string[]): any[] {
  let rows: any[] = [];
  if (payload && typeof payload === "object") {
    const p = payload as any;
    for (const key of ["items", "data", "observations", "result"]) {
      if (Array.isArray(p[key])) {
        rows = p[key] as any[];
        break;
      }
    }
  } else if (Array.isArray(payload)) {
    rows = payload as any[];
  }
  if (!rows || rows.length === 0) return [];

  const df: any[] = [];

  const normalizedDot = new Set(
    seriesCodes.map((c) => denormalizeCode(c).toUpperCase()),
  );
  const normalizedUs = new Set(
    seriesCodes.map((c) => normalizeCode(c).toUpperCase()),
  );

  for (const row of rows) {
    let dateCol = Object.keys(row).find((c) =>
      ["TARIH", "DATE", "TARİH", "TARI"].includes(c.toUpperCase()),
    );
    if (!dateCol) {
      dateCol = Object.keys(row).find((c) =>
        ["UNIXTIME", "dateString", "OBS_DATE"].includes(c),
      );
    }

    let parsedDate: Date | null = null;
    if (dateCol) {
      if (dateCol === "UNIXTIME") {
        const v = row[dateCol];
        const ts =
          typeof v === "object" && v.$numberLong
            ? parseInt(v.$numberLong)
            : parseInt(v);
        if (!isNaN(ts)) parsedDate = new Date(ts * 1000);
      } else {
        parsedDate = parseEVDSDate(row[dateCol]);
      }
    }
    if (!parsedDate) continue;

    const newRow: any = { Date: parsedDate };

    for (const col of Object.keys(row)) {
      if (
        ["YEAR", "MONTH", "DAY", "QUARTER", "_DATE", "UNIXTIME"].includes(
          col.toUpperCase(),
        )
      )
        continue;
      if (col === dateCol) continue;

      const colDot = denormalizeCode(col).toUpperCase();
      let targetCol = col;

      if (normalizedDot.has(colDot)) {
        targetCol = denormalizeCode(col);
      } else if (colDot.includes("-")) {
        const base = colDot.substring(0, colDot.lastIndexOf("-"));
        if (normalizedDot.has(base)) {
          targetCol = denormalizeCode(col.substring(0, col.lastIndexOf("-")));
        }
      } else if (normalizedUs.has(col.toUpperCase())) {
        targetCol = denormalizeCode(col);
      }

      if (normalizedDot.has(denormalizeCode(targetCol).toUpperCase())) {
        const val = parseFloat(String(row[col]));
        newRow[targetCol] = isNaN(val) ? null : val;
      }
    }

    // Surface as "Value" if it's a single series
    if (seriesCodes.length === 1 && Object.keys(newRow).length === 2) {
      const valKey = Object.keys(newRow).find((k) => k !== "Date") as string;
      newRow["Value"] = newRow[valKey];
      delete newRow[valKey];
    }

    df.push(newRow);
  }

  return df.sort((a, b) => a.Date.getTime() - b.Date.getTime());
}

// --- EVDSSeries ---
export class EVDSSeries {
  private _codeUser: string;
  private _codeNormalized: string;
  private _provider: EVDSProvider;
  private _infoCache: any | null = null;

  constructor(code: string) {
    if (!code || typeof code !== "string") {
      throw new Error("EVDS series code is required (e.g. 'TP.DK.USD.A')");
    }
    this._codeUser = code;
    this._codeNormalized = normalizeCode(code);
    this._provider = getEVDSProvider();
  }

  get code(): string {
    return this._codeUser;
  }

  async info(): Promise<any> {
    if (this._infoCache) return this._infoCache;
    const located = await this._provider.findSeries(this._codeUser);
    if (!located)
      throw new APIError(`EVDS series not found: ${this._codeUser}`);

    const info = { ...located };
    info.SERIE_CODE = denormalizeCode(info.SERIE_CODE || this._codeUser);

    const dg = info._datagroup || {};
    const cat = info._category || {};

    info.DATAGROUP_CODE = info.DATAGROUP_CODE || dg.DATAGROUP_CODE;
    info.DATAGROUP_TYPE = info.DATAGROUP_TYPE || dg.DATAGROUP_TYPE;
    info.CATEGORY_ID = info.CATEGORY_ID || cat.CATEGORY_ID;
    info.CATEGORY_TR = info.CATEGORY_TR || cat.TOPIC_TITLE_TR;
    info.CATEGORY_EN = info.CATEGORY_EN || cat.TOPIC_TITLE_ENG;

    delete info._datagroup;
    delete info._category;

    this._infoCache = info;
    return info;
  }

  async datagroup(): Promise<string | null> {
    const inf = await this.info();
    return inf.DATAGROUP_CODE || null;
  }

  async nativeFrequency(): Promise<string | null> {
    const inf = await this.info();
    const raw = inf.FREQUENCY;
    if (typeof raw === "number") {
      const normalized = (getEVDSProvider() as any).resolveFrequency(raw);
      for (const [key, val] of Object.entries(FREQUENCY)) {
        if (val === normalized) return key;
      }
    }
    const s = (inf.FREQUENCY_STR || "").toUpperCase();
    const mapping: Record<string, string> = {
      GÜNLÜK: "daily",
      "İŞ GÜNÜ": "workday",
      HAFTALIK: "weekly",
      "İKİ HAFTALIK": "biweekly",
      AYLIK: "monthly",
      "ÜÇ AYLIK": "quarterly",
      "ALTI AYLIK": "semiannual",
      YILLIK: "annual",
    };
    return mapping[s] || null;
  }

  async range(): Promise<{ start: Date | null; end: Date | null }> {
    const freq = (await this.nativeFrequency()) || "monthly";
    const inf = await this.info();
    const dg = inf.DATAGROUP_CODE || "";
    const rng = await this._provider.getSeriesRange(
      [this._codeUser],
      [dg],
      freq,
    );
    const entry = rng[this._codeNormalized.toUpperCase()] || {};
    return {
      start: parseEVDSDate(entry.start),
      end: parseEVDSDate(entry.end),
    };
  }

  async history(
    options: {
      period?: string;
      start?: string | Date;
      end?: string | Date;
      frequency?: string | number;
      aggregation?: string;
      formula?: string;
      decimals?: number;
      decimalSeparator?: string;
    } = {},
  ): Promise<any[]> {
    const [startStr, endStr] = resolveWindow(
      options.period || "1y",
      options.start,
      options.end,
    );
    const freq =
      options.frequency || (await this.nativeFrequency()) || "monthly";

    const payload = await this._provider.getSeriesData(
      [this._codeUser],
      startStr,
      endStr,
      freq,
      options.aggregation || "avg",
      options.formula || "level",
      options.decimals || 2,
      0,
      "json",
      options.decimalSeparator || ".",
    );

    return frameFromPayload(payload, [this._codeUser]);
  }
}

// --- EVDS Catalogue ---
export class EVDS {
  private _provider: EVDSProvider;

  constructor() {
    this._provider = getEVDSProvider();
  }

  async categories(): Promise<any[]> {
    const cats = await this._provider.getCategories();
    return cats.map((c: any) => ({
      CATEGORY_ID: c.CATEGORY_ID,
      TOPIC_TITLE_TR: c.TOPIC_TITLE_TR,
      TOPIC_TITLE_EN: c.TOPIC_TITLE_ENG,
      PARENT_CATEGORY_ID: c.UST_CATEGORY_ID,
      LEVEL: c.SEVIYE,
      DATAGROUP_COUNT: (c.DATAGROUPS || []).length,
    }));
  }

  async datagroups(categoryId?: number): Promise<any[]> {
    const cats = await this._provider.getCategories();
    const rows: any[] = [];
    for (const c of cats) {
      if (categoryId !== undefined && c.CATEGORY_ID !== categoryId) continue;
      for (const dg of c.DATAGROUPS || []) {
        rows.push({
          DATAGROUP_CODE: dg.DATAGROUP_CODE,
          DATAGROUP_TYPE: dg.DATAGROUP_TYPE,
          DATAGROUP_TYPE_EN: dg.DATAGROUP_TYPE_ENG,
          CATEGORY_ID: c.CATEGORY_ID,
          CATEGORY_TR: c.TOPIC_TITLE_TR,
          FREQUENCY: dg.FREQUENCY,
          FREQUENCY_STR: dg.FREQUENCY_STR,
          UNIT_TR: dg.BIRIMI,
          UNIT_EN: dg.BIRIMI_EN,
          DATA_SOURCE: dg.DATASOURCE,
          DATA_SOURCE_EN: dg.DATASOURCE_ENG,
          LAST_UPDATED: dg.LAST_UPDATED,
          METADATA_LINK: dg.METADATA_LINK,
          METADATA_LINK_EN: dg.METADATA_LINK_ENG,
          REV_POL_LINK: dg.REV_POL_LINK,
          REV_POL_LINK_EN: dg.REV_POL_LINK_ENG,
          APP_CHA_LINK: dg.APP_CHA_LINK,
          APP_CHA_LINK_EN: dg.APP_CHA_LINK_ENG,
          NOTE: dg.NOTE,
          NOTE_EN: dg.NOTE_ENG,
        });
      }
    }
    return rows;
  }

  async seriesInGroup(datagroupCode: string): Promise<any[]> {
    const rows = await this._provider.getSeriesList(datagroupCode);
    if (!rows || rows.length === 0) return [];
    return rows.map((r: any) => ({
      ...r,
      SERIE_CODE: r.SERIE_CODE ? denormalizeCode(r.SERIE_CODE) : undefined,
    }));
  }

  async search(
    term: string,
    options: {
      lang?: "tr" | "en";
      scope?: "all" | "categories" | "datagroups" | "series";
    } = {},
  ): Promise<any[]> {
    if (!term || typeof term !== "string")
      throw new Error("search term is required");
    const needle = term.trim().toLowerCase();
    if (!needle) return [];

    const lang = options.lang || "tr";
    const scope = options.scope || "all";
    const results: any[] = [];

    const cats = await this._provider.getCategories();

    if (["all", "categories"].includes(scope)) {
      for (const c of cats) {
        const tr = (c.TOPIC_TITLE_TR || "").toLowerCase();
        const en = (c.TOPIC_TITLE_ENG || "").toLowerCase();
        const hit =
          (lang === "tr" && (tr.includes(needle) || en.includes(needle))) ||
          (lang === "en" && en.includes(needle));
        if (hit) {
          results.push({
            hit_type: "category",
            CODE: c.CATEGORY_ID,
            NAME_TR: c.TOPIC_TITLE_TR,
            NAME_EN: c.TOPIC_TITLE_ENG,
          });
        }
      }
    }

    if (["all", "datagroups"].includes(scope)) {
      for (const c of cats) {
        for (const dg of c.DATAGROUPS || []) {
          const tr = (dg.DATAGROUP_TYPE || "").toLowerCase();
          const en = (dg.DATAGROUP_TYPE_ENG || "").toLowerCase();
          const hit =
            (lang === "tr" && (tr.includes(needle) || en.includes(needle))) ||
            (lang === "en" && en.includes(needle));
          if (hit) {
            results.push({
              hit_type: "datagroup",
              CODE: dg.DATAGROUP_CODE,
              NAME_TR: dg.DATAGROUP_TYPE,
              NAME_EN: dg.DATAGROUP_TYPE_ENG,
              CATEGORY_TR: c.TOPIC_TITLE_TR,
              FREQUENCY_STR: dg.FREQUENCY_STR,
            });
          }
        }
      }
    }

    if (["all", "series"].includes(scope)) {
      for (const c of cats) {
        for (const dg of c.DATAGROUPS || []) {
          const dgCode = dg.DATAGROUP_CODE;
          if (!dgCode) continue;

          try {
            const seriesList = await this._provider.getSeriesList(dgCode);
            for (const s of seriesList) {
              const tr = (s.SERIE_NAME || "").toLowerCase();
              const en = (s.SERIE_NAME_ENG || "").toLowerCase();
              const sc = (s.SERIE_CODE || "").toLowerCase();
              const hit =
                (lang === "tr" &&
                  (tr.includes(needle) ||
                    en.includes(needle) ||
                    sc.includes(needle))) ||
                (lang === "en" && (en.includes(needle) || sc.includes(needle)));
              if (hit) {
                results.push({
                  hit_type: "series",
                  CODE: denormalizeCode(s.SERIE_CODE || ""),
                  NAME_TR: s.SERIE_NAME,
                  NAME_EN: s.SERIE_NAME_ENG,
                  DATAGROUP_CODE: dgCode,
                  DATAGROUP_TR: dg.DATAGROUP_TYPE,
                  FREQUENCY_STR: s.FREQUENCY_STR,
                });
              }
            }
          } catch {
            // Ignore errors for specific datagroups
          }
        }
      }
    }

    return results;
  }

  series(code: string): EVDSSeries {
    return new EVDSSeries(code);
  }

  async dashboard(slug: string = "baslica-gostergeler"): Promise<any> {
    return this._provider.getDashboard(slug);
  }

  async announcements(): Promise<any[]> {
    return this._provider.getAnnouncements();
  }

  async homePageDashboards(): Promise<any[]> {
    const items = await this._provider.getHomePageDashboards();
    const rows = items.map((d: any) => ({
      name: d.dashboardName,
      name_en: d.dashboardNameEn,
      encoded_id: d.encodedId,
      chart_count: (d.chartsList || []).length,
      screen_order: d.ekranSiraNo,
    }));
    return rows.sort((a, b) => (a.screen_order || 0) - (b.screen_order || 0));
  }

  async dashboardById(encodedId: string): Promise<any> {
    return this._provider.getDashboardByEncodedId(encodedId);
  }

  async searchServer(term: string): Promise<any> {
    const raw = await this._provider.searchServer(term);
    return {
      datagroups: raw.veriGruplari || [],
      series: raw.seriler || [],
      reports: raw.raporlar || [],
    };
  }

  async datagroupData(
    datagroupCode: string,
    options: {
      period?: string;
      start?: string | Date;
      end?: string | Date;
      frequency?: string | number;
      decimals?: number;
    } = {},
  ): Promise<any[]> {
    const [startStr, endStr] = resolveWindow(
      options.period,
      options.start,
      options.end,
    );
    const payload = await this._provider.getDatagroupData(
      datagroupCode,
      startStr,
      endStr,
      options.frequency,
      options.decimals || 2,
    );

    let rows: any[] = [];
    if (payload && typeof payload === "object") {
      const p = payload as any;
      for (const key of ["items", "data", "observations", "result"]) {
        if (Array.isArray(p[key])) {
          rows = p[key] as any[];
          break;
        }
      }
    } else if (Array.isArray(payload)) {
      rows = payload as any[];
    }

    let seriesCols: string[] = [];
    if (rows.length > 0) {
      const sampleKeys = Object.keys(rows[0]);
      seriesCols = sampleKeys.filter(
        (k) =>
          !["TARIH", "DATE", "UNIXTIME", "DATESTRING"].includes(
            k.toUpperCase(),
          ),
      );
    }

    return frameFromPayload(payload, seriesCols);
  }
}

// --- Module-level shortcuts ---
export function evdsCategories(): Promise<any[]> {
  return new EVDS().categories();
}

export function evdsSearch(
  term: string,
  options?: {
    lang?: "tr" | "en";
    scope?: "all" | "categories" | "datagroups" | "series";
  },
): Promise<any[]> {
  return new EVDS().search(term, options);
}

export function evdsSeries(
  code: string,
  options: {
    period?: string;
    start?: string | Date;
    end?: string | Date;
    frequency?: string | number;
    aggregation?: string;
    formula?: string;
    decimals?: number;
    decimalSeparator?: string;
  } = {},
): Promise<any[]> {
  return new EVDSSeries(code).history(options);
}

export async function evdsDownload(
  codes: string[] | string,
  options: {
    period?: string;
    start?: string | Date;
    end?: string | Date;
    frequency?: string | number;
    aggregation?: string | string[];
    formula?: string | string[];
    decimals?: number;
    decimalSeparator?: string;
  } = {},
): Promise<any[]> {
  const codesList = Array.isArray(codes) ? codes : [codes];
  if (codesList.length === 0)
    throw new Error("at least one series code is required");

  const [startStr, endStr] = resolveWindow(
    options.period || "1y",
    options.start,
    options.end,
  );
  const provider = getEVDSProvider();

  const payload = await provider.getSeriesData(
    codesList,
    startStr,
    endStr,
    options.frequency || "monthly",
    options.aggregation || "avg",
    options.formula || "level",
    options.decimals || 2,
    0,
    "json",
    options.decimalSeparator || ".",
  );

  const df = frameFromPayload(payload, codesList);

  if (codesList.length === 1 && df.length > 0 && "Value" in df[0]) {
    return df.map((row) => {
      const newRow = { ...row };
      newRow[codesList[0]] = newRow.Value;
      delete newRow.Value;
      return newRow;
    });
  }

  return df;
}

export {
  AGGREGATION,
  clearEVDSKey,
  EVDSProvider,
  FORMULA,
  FREQUENCY,
  getEVDSKey,
  getEVDSProvider,
  setEVDSKey,
};
