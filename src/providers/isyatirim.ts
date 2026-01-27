import axios from "axios";
import * as cheerio from "cheerio";

import {
  APIError,
  DataNotAvailableError,
  TickerNotFoundError,
} from "~/exceptions";
import { BaseProvider } from "~/providers/base";
import { CurrentData, OHLCVData } from "~/types";
import { TTL } from "~/utils/helpers";

export interface DividendData {
  date: Date;
  amount: number;
  grossRate: number;
  netRate: number;
  totalDividend: number;
}

export interface CapitalIncreaseData {
  date: Date;
  capital: number;
  rightsIssue: number;
  bonusFromCapital: number;
  bonusFromDividend: number;
}

export interface CompanyMetrics {
  marketCap: number | null;
  peRatio: number | null;
  pbRatio: number | null;
  evEbitda: number | null;
  freeFloat: number | null;
  foreignRatio: number | null;
  netDebt: number | null;
}

export class IsYatirimProvider extends BaseProvider {
  private static readonly BASE_URL =
    "https://www.isyatirim.com.tr/_Layouts/15/IsYatirim.Website/Common";
  private static readonly STOCK_INFO_URL =
    "https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/StockInfo/CompanyInfoAjax.aspx";

  // Financial statement groups
  public static readonly FINANCIAL_GROUP_INDUSTRIAL = "XI_29"; // Sanayi şirketleri
  public static readonly FINANCIAL_GROUP_BANK = "UFRS"; // Bankalar

  // Known market indices
  private static readonly INDICES: Record<string, string> = {
    XU100: "BIST 100",
    XU050: "BIST 50",
    XU030: "BIST 30",
    XBANK: "BIST Banka",
    XUSIN: "BIST Sınai",
    XHOLD: "BIST Holding ve Yatırım",
    XUTEK: "BIST Teknoloji",
    XGIDA: "BIST Gıda",
    XTRZM: "BIST Turizm",
    XULAS: "BIST Ulaştırma",
    XSGRT: "BIST Sigorta",
    XMANA: "BIST Metal Ana",
    XKMYA: "BIST Kimya",
    XMADN: "BIST Maden",
    XELKT: "BIST Elektrik",
    XTEKS: "BIST Tekstil",
    XILTM: "BIST İletişim",
    XUMAL: "BIST Mali",
    XUTUM: "BIST Tüm",
  };

  private cookies: string = "";

  constructor() {
    super({
      baseUrl: "https://www.isyatirim.com.tr",
    });
  }

  /**
   * Get real-time quote for a symbol using OneEndeks API.
   */
  async getRealtimeQuote(symbol: string): Promise<CurrentData> {
    const cleanSymbol = symbol
      .toUpperCase()
      .replace(".IS", "")
      .replace(".E", "");
    const cacheKey = `isyatirim:quote:${cleanSymbol}`;

    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as CurrentData;
    }

    const url = `${IsYatirimProvider.BASE_URL}/ChartData.aspx/OneEndeks`;

    // Ensure session cookies are set
    if (!this.cookies) {
      await this._getSessionForStock(cleanSymbol);
    }

    try {
      const response = await this.client.get(url, {
        params: { endeks: cleanSymbol },
        headers: {
          Cookie: this.cookies,
        },
      });
      const data = response.data;
      if (!data || !data.symbol) {
        throw new TickerNotFoundError(cleanSymbol);
      }

      const result = this._parseQuote(data);
      this.cache.set(cacheKey, result, TTL.FX_RATES);
      return result;
    } catch (e) {
      // Fallback to screener API
      try {
        const fallbackData = await this._fetchFallbackQuote(cleanSymbol);
        this.cache.set(cacheKey, fallbackData, TTL.FX_RATES);
        return fallbackData;
      } catch (fallbackError) {
        // If it was a TickerNotFoundError originally and fallback also failed, it's really not found
        if (e instanceof TickerNotFoundError) {
          throw e;
        }

        throw new APIError(
          `Failed to fetch quote for ${cleanSymbol} (primary and fallback failed): ${(e as Error).message}`,
        );
      }
    }
  }

  /**
   * Get historical data for an index.
   */
  async getIndexHistory(
    indexCode: string,
    start?: Date,
    end?: Date,
  ): Promise<OHLCVData[]> {
    const cleanIndex = indexCode.toUpperCase();
    const endDate = end || new Date();
    const startDate =
      start || new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000);

    const startStr = this._formatDate(startDate);
    const endStr = this._formatDate(endDate);

    const cacheKey = `isyatirim:index_history:${cleanIndex}:${startStr}:${endStr}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as OHLCVData[];
    }

    const url = `${IsYatirimProvider.BASE_URL}/ChartData.aspx/IndexHistoricalAll`;

    // Ensure session cookies
    if (!this.cookies) {
      await this._getSessionForStock(
        cleanIndex === "XU100" ? "THYAO" : "THYAO",
      ); // Just need any valid public page
    }

    try {
      // Format dates as YYYYMMDDHHmmss
      const formatDateTime = (date: Date) => {
        return date
          .toISOString()
          .replace(/[-T:.Z]/g, "")
          .slice(0, 14);
      };

      const fromStr = formatDateTime(startDate);
      const toStr = formatDateTime(endDate);

      const response = await this.client.get(url, {
        params: {
          period: "1440",
          from: fromStr,
          to: toStr,
          endeks: cleanIndex,
        },
        headers: {
          Cookie: this.cookies,
          Referer:
            "https://www.isyatirim.com.tr/tr-tr/analiz/Sayfalar/default.aspx",
        },
      });

      const data = response.data;
      // IsYatirim newer API returns { data: [...], timestamp: ... }
      const historyData = data.data || data;

      if (!historyData || !Array.isArray(historyData)) {
        throw new DataNotAvailableError(`No data for index: ${cleanIndex}`);
      }

      const df = this._parseIndexHistory(historyData);
      this.cache.set(cacheKey, df, TTL.OHLCV_HISTORY);
      return df;
    } catch (e) {
      if (e instanceof DataNotAvailableError) throw e;
      throw new APIError(
        `Failed to fetch index history for ${cleanIndex}: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Get current information for an index.
   */
  async getIndexInfo(
    indexCode: string,
  ): Promise<CurrentData & { name: string; type: string }> {
    const cleanIndex = indexCode.toUpperCase();

    if (!IsYatirimProvider.INDICES[cleanIndex]) {
      throw new TickerNotFoundError(`Unknown index: ${cleanIndex}`);
    }

    const quote = await this.getRealtimeQuote(cleanIndex);
    return {
      ...quote,
      name: IsYatirimProvider.INDICES[cleanIndex],
      type: "index",
    };
  }

  /**
   * Get financial statements for a company.
   */
  async getFinancialStatements(
    symbol: string,
    statementType:
      | "balance_sheet"
      | "income_stmt"
      | "cashflow" = "balance_sheet",
    quarterly: boolean = false,
    financialGroup?: string,
  ): Promise<Record<string, unknown>[]> {
    const cleanSymbol = symbol
      .toUpperCase()
      .replace(".IS", "")
      .replace(".E", "");
    const cacheKey = `isyatirim:financial:${cleanSymbol}:${statementType}:${quarterly}`;

    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as Record<string, unknown>[];
    }

    if (!financialGroup) {
      financialGroup = IsYatirimProvider.FINANCIAL_GROUP_INDUSTRIAL;
    }

    const tableMap = {
      balance_sheet: ["BILANCO_AKTIF", "BILANCO_PASIF"],
      income_stmt: ["GELIR_TABLOSU"],
      cashflow: ["NAKIT_AKIM_TABLOSU"],
    };

    const tables = tableMap[statementType] || [
      "BILANCO_AKTIF",
      "BILANCO_PASIF",
    ];
    const currentYear = new Date().getFullYear();
    const periods = this._getPeriods(currentYear, quarterly, 5);

    const allData: Record<string, unknown>[][] = [];

    for (const tableName of tables) {
      try {
        const df = await this._fetchFinancialTable(
          cleanSymbol,
          tableName,
          financialGroup,
          periods,
        );
        if (df.length > 0) {
          allData.push(df);
        }
      } catch {
        continue;
      }
    }

    if (allData.length === 0) {
      throw new DataNotAvailableError(
        `No financial data available for ${cleanSymbol}`,
      );
    }

    // Combine logic (simple concat for now as they are distinct rows usually)
    let result = allData.flat();

    // De-duplication could be needed if tables overlap, but usually they don't for distinct table names

    this.cache.set(cacheKey, result, TTL.FINANCIAL_STATEMENTS);
    return result;
  }

  /**
   * Get dividend history for a stock.
   */
  async getDividends(symbol: string): Promise<DividendData[]> {
    const cleanSymbol = symbol
      .toUpperCase()
      .replace(".IS", "")
      .replace(".E", "");
    const cacheKey = `isyatirim:dividends:${cleanSymbol}`;

    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as DividendData[];
    }

    try {
      const data = await this._fetchSermayeData(cleanSymbol);
      const dividends = this._parseDividends(data);
      this.cache.set(cacheKey, dividends, TTL.SEARCH);
      return dividends;
    } catch {
      return [];
    }
  }

  /**
   * Get capital increase (split) history for a stock.
   */
  async getCapitalIncreases(symbol: string): Promise<CapitalIncreaseData[]> {
    const cleanSymbol = symbol
      .toUpperCase()
      .replace(".IS", "")
      .replace(".E", "");
    const cacheKey = `isyatirim:splits:${cleanSymbol}`;

    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as CapitalIncreaseData[];
    }

    try {
      const data = await this._fetchSermayeData(cleanSymbol);
      const splits = this._parseCapitalIncreases(data);
      this.cache.set(cacheKey, splits, TTL.SEARCH);
      return splits;
    } catch {
      return [];
    }
  }

  /**
   * Get major shareholders (ortaklık yapısı) for a stock.
   */
  async getMajorHolders(
    symbol: string,
  ): Promise<Array<{ holder: string; percentage: number }>> {
    const cleanSymbol = symbol
      .toUpperCase()
      .replace(".IS", "")
      .replace(".E", "");
    const cacheKey = `isyatirim:major_holders:${cleanSymbol}`;

    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as Array<{ holder: string; percentage: number }>;
    }

    const stockPageUrl = `https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/sirket-karti.aspx?hisse=${cleanSymbol}`;

    try {
      const response = await this.client.get(stockPageUrl, { timeout: 15000 });
      const html = response.data as string;

      const pattern = /var OrtaklikYapisidata = \[(.*?)\];/s;
      const match = pattern.exec(html);

      if (!match) return [];

      const jsArray = match[1].trim();
      if (!jsArray) return [];

      // Convert JS object to valid JSON
      const jsonStr = jsArray
        .replace(/([{,])(\w+):/g, '$1"$2":')
        .replace(/'/g, '"');

      const data = JSON.parse(`[${jsonStr}]`) as Array<{
        name: string;
        y: number;
      }>;

      const records = data.map((item) => ({
        holder: item.name || "Unknown",
        percentage: Number((item.y || 0).toFixed(2)),
      }));

      this.cache.set(cacheKey, records, TTL.SEARCH);
      return records;
    } catch (e) {
      console.error(`Failed to fetch major holders for ${cleanSymbol}:`, e);
      return [];
    }
  }

  /**
   * Get company metrics from şirket kartı page (Cari Değerler).
   */
  async getCompanyMetrics(symbol: string): Promise<CompanyMetrics> {
    const cleanSymbol = symbol
      .toUpperCase()
      .replace(".IS", "")
      .replace(".E", "");
    const cacheKey = `isyatirim:metrics:${cleanSymbol}`;

    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as CompanyMetrics;
    }

    const stockPageUrl = `https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/sirket-karti.aspx?hisse=${cleanSymbol}`;

    try {
      const response = await this.client.get(stockPageUrl, { timeout: 15000 });
      const html = response.data as string;

      const $ = cheerio.load(html);
      const result: CompanyMetrics = {
        marketCap: null,
        peRatio: null,
        pbRatio: null,
        evEbitda: null,
        freeFloat: null,
        foreignRatio: null,
        netDebt: null,
      };

      // Find "Cari Değerler" section table
      $("table tr").each((_, tr) => {
        const th = $(tr).find("th").text().trim();
        const td = $(tr).find("td").text().trim();

        if (!th || !td) return;

        const valueStr = td.replace(/\./g, "").replace(",", "."); // 1.234,56 -> 1234.56

        try {
          if (th.includes("F/K") && !th.includes("FD")) {
            result.peRatio = parseFloat(valueStr);
          } else if (th.includes("PD/DD")) {
            result.pbRatio = parseFloat(valueStr);
          } else if (th.includes("FD/FAVÖK")) {
            result.evEbitda = parseFloat(valueStr);
          } else if (th.includes("Piyasa Değeri")) {
            // mnTL -> conversion
            const num = parseFloat(valueStr.replace(/[^\d.-]/g, ""));
            result.marketCap = Math.round(num * 1_000_000);
          } else if (th.includes("Net Borç")) {
            const num = parseFloat(valueStr.replace(/[^\d.-]/g, ""));
            result.netDebt = Math.round(num * 1_000_000);
          } else if (th.includes("Halka Açıklık")) {
            result.freeFloat = parseFloat(valueStr.replace(/[^\d.-]/g, ""));
          } else if (th.includes("Yabancı Oranı")) {
            result.foreignRatio = parseFloat(valueStr.replace(/[^\d.-]/g, ""));
          }
        } catch {
          // ignore parsing error
        }
      });

      this.cache.set(cacheKey, result, TTL.REALTIME_PRICE);
      return result;
    } catch {
      // return empty metrics if failed
      return {
        marketCap: null,
        peRatio: null,
        pbRatio: null,
        evEbitda: null,
        freeFloat: null,
        foreignRatio: null,
        netDebt: null,
      };
    }
  }

  /**
   * Get business summary (Faal Alanı) for a stock.
   */
  async getBusinessSummary(symbol: string): Promise<string | null> {
    // ... existing implementation ...
    const cleanSymbol = symbol
      .toUpperCase()
      .replace(".IS", "")
      .replace(".E", "");
    const cacheKey = `isyatirim:business_summary:${cleanSymbol}`;

    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as string;
    }

    const stockPageUrl = `https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/sirket-karti.aspx?hisse=${cleanSymbol}`;

    try {
      const response = await this.client.get(stockPageUrl, { timeout: 15000 });
      const html = response.data as string;
      const $ = cheerio.load(html);

      // Look for th "Faal Alanı"
      let summary: string | null = null;
      $("th").each((_, el) => {
        if ($(el).text().trim() === "Faal Alanı") {
          summary = $(el).next("td").text().trim();
        }
      });

      if (summary) {
        this.cache.set(cacheKey, summary, TTL.FINANCIAL_STATEMENTS);
        return summary;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async _fetchFallbackQuote(symbol: string): Promise<CurrentData> {
    interface ScreenerDataItem {
      Hisse?: string;
      [key: string]: string | undefined;
    }

    const listCacheKey = "isyatirim:screener_list_fallback";
    let allStocks = this.cache.get(listCacheKey) as
      | ScreenerDataItem[]
      | undefined;

    if (!allStocks) {
      const url =
        "https://www.isyatirim.com.tr/tr-tr/analiz/_Layouts/15/IsYatirim.Website/StockInfo/CompanyInfoAjax.aspx/getScreenerDataNEW";
      const payload = {
        criterias: [
          ["7", "1", "50000", "False"], // Price
        ],
        sektor: "",
        endeks: "",
        oneri: "",
        takip: "",
        lang: "1055",
      };

      const headers = {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json, text/javascript, */*; q=0.01",
        Origin: "https://www.isyatirim.com.tr",
        Referer: `https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/sirket-karti.aspx?hisse=${symbol}`,
        Cookie: this.cookies,
      };

      try {
        // Use direct axios instance to avoid BaseProvider config interference
        const response = await axios.post(url, payload, {
          headers,
          timeout: 20000,
        });
        const d = response.data.d;
        if (d) {
          try {
            allStocks = JSON.parse(d);
          } catch (parseError) {
            console.error("Fallback JSON parse error:", parseError);
            throw parseError;
          }
          this.cache.set(listCacheKey, allStocks, 60); // Cache list for 1 min
          this.cache.set(listCacheKey, allStocks, 60); // Cache list for 1 min
        } else {
          throw new APIError("Screener API returned empty data");
        }
      } catch (e) {
        throw e;
      }
    }

    if (!allStocks) throw new APIError("Failed to load stock list");

    const stock = allStocks.find(
      (x) => x.Hisse && x.Hisse.startsWith(`${symbol} `),
    );
    if (!stock) {
      throw new TickerNotFoundError(symbol);
    }

    // Parse data
    // "7": "297", "16": "..."
    const price = parseFloat(stock["7"]?.replace(",", ".") || "0");
    const changePct = parseFloat(stock["16"]?.replace(",", ".") || "0");

    // Calculate change amount if we have only pct
    // change = price * (changePct / 100) / (1 + changePct / 100) -> approx price - prevClose
    // prevClose = price / (1 + changePct/100)
    const prevClose = price / (1 + changePct / 100);
    const change = price - prevClose;

    return {
      symbol,
      last: price,
      open: price, // Approx
      high: price, // Approx
      low: price, // Approx
      close: Number(prevClose.toFixed(2)),
      volume: 0,
      bid: 0,
      ask: 0,
      change: Number(change.toFixed(2)),
      changePercent: changePct,
      updateTime: new Date(),
    };
  }

  // --- Helpers ---

  private _formatDate(date: Date): string {
    const d = date.getDate().toString().padStart(2, "0");
    const m = (date.getMonth() + 1).toString().padStart(2, "0");
    const y = date.getFullYear();
    return `${d}-${m}-${y}`;
  }

  private _parseQuote(data: Record<string, unknown>): CurrentData {
    const last = Number(data.last) || 0;
    const prevClose = Number(data.dayClose) || 0;
    const change = prevClose ? last - prevClose : 0;
    const changePct = prevClose ? (change / prevClose) * 100 : 0;

    let updateTime = new Date();
    try {
      const updateDate = ((data.updateDate as string) || "").replace(
        "+03",
        "+03:00",
      );
      updateTime = new Date(updateDate);
    } catch {
      // ignore
    }

    return {
      symbol: (data.symbol as string) || "",
      last,
      open: Number(data.open) || 0,
      high: Number(data.high) || 0,
      low: Number(data.low) || 0,
      close: prevClose,
      volume: Number(data.volume) || 0,
      bid: Number(data.bid) || 0,
      ask: Number(data.ask) || 0,
      change: Number(change.toFixed(2)),
      changePercent: Number(changePct.toFixed(2)),
      updateTime,
    };
  }

  private _parseIndexHistory(
    data: Array<Record<string, unknown>>,
  ): OHLCVData[] {
    const records: OHLCVData[] = [];

    for (const item of data) {
      try {
        // Handle array format [timestamp, value]
        if (Array.isArray(item)) {
          const timestamp = Number(item[0]);
          const value = Number(item[1]);
          if (!timestamp) continue;

          records.push({
            date: new Date(timestamp),
            open: value,
            high: value,
            low: value,
            close: value,
            volume: 0,
          });
          continue;
        }

        // Handle object format { date: "...", close: ... }
        const dictItem = item as Record<string, unknown>;
        const dateStr = ((dictItem.date as string) || "").substring(0, 10);

        // Some responses use 'timestamp' field
        if (!dateStr && dictItem.timestamp) {
          records.push({
            date: new Date(Number(dictItem.timestamp)),
            open: Number(dictItem.open) || 0,
            high: Number(dictItem.high) || 0,
            low: Number(dictItem.low) || 0,
            close: Number(dictItem.close) || 0,
            volume: Number(dictItem.volume) || 0,
          });
          continue;
        }

        if (!dateStr) continue;

        records.push({
          date: new Date(dateStr),
          open: Number(dictItem.open) || 0,
          high: Number(dictItem.high) || 0,
          low: Number(dictItem.low) || 0,
          close: Number(dictItem.close) || 0,
          volume: Number(dictItem.volume) || 0,
        });
      } catch {
        continue;
      }
    }

    return records.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  private async _getSessionForStock(symbol: string): Promise<void> {
    const stockPageUrl = `https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/sirket-karti.aspx?hisse=${symbol}`;
    try {
      const response = await this.client.get(stockPageUrl, {
        timeout: 10000,
        headers: {
          // Use same UA as fallback to avoid session mismatch
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      const setCookie = response.headers["set-cookie"];
      if (setCookie && Array.isArray(setCookie)) {
        this.cookies = setCookie.map((c) => c.split(";")[0]).join("; ");
      }
    } catch (err) {
      // ignore
    }
  }

  private async _fetchSermayeData(
    symbol: string,
  ): Promise<Record<string, unknown>> {
    await this._getSessionForStock(symbol);

    const url = `${IsYatirimProvider.STOCK_INFO_URL}/GetSermayeArttirimlari`;

    const headers = {
      "Content-Type": "application/json; charset=UTF-8",
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/sirket-karti.aspx?hisse=${symbol}`,
      Origin: "https://www.isyatirim.com.tr",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
      Cookie: this.cookies,
    };

    const payload = {
      hisseKodu: symbol,
      hisseTanimKodu: "",
      yil: 0,
      zaman: "HEPSI",
      endeksKodu: "09",
      sektorKodu: "",
    };

    try {
      const response = await this.client.post(url, payload, {
        headers,
        timeout: 15000,
      });
      return response.data;
    } catch (e) {
      throw new APIError(
        `Failed to fetch sermaye data for ${symbol}: ${(e as Error).message}`,
      );
    }
  }

  private _parseSermayeResponse(
    data: Record<string, unknown>,
  ): Array<Record<string, unknown>> {
    const dValue = data.d || "[]";

    if (typeof dValue === "string") {
      try {
        return JSON.parse(dValue);
      } catch {
        return [];
      }
    } else if (Array.isArray(dValue)) {
      return dValue as Array<Record<string, unknown>>;
    }
    return [];
  }

  private _parseDividends(data: Record<string, unknown>): DividendData[] {
    const items = this._parseSermayeResponse(data);
    const records: DividendData[] = [];

    for (const item of items) {
      try {
        if (item.SHT_KODU !== "04") continue;

        const timestamp = Number(item.SHHE_TARIH);
        if (!timestamp) continue;

        const dt = new Date(timestamp);
        dt.setHours(0, 0, 0, 0);

        const grossRate = Number(item.SHHE_NAKIT_TM_ORAN) || 0;
        const netRate = Number(item.SHHE_NAKIT_TM_ORAN_NET) || 0;
        const totalDividend = Number(item.SHHE_NAKIT_TM_TUTAR) || 0;
        const amount = grossRate ? grossRate / 100 : 0;

        records.push({
          date: dt,
          amount: Number(amount.toFixed(4)),
          grossRate: Number(grossRate.toFixed(2)),
          netRate: Number(netRate.toFixed(2)),
          totalDividend,
        });
      } catch {
        continue;
      }
    }
    return records.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  private _parseCapitalIncreases(
    data: Record<string, unknown>,
  ): CapitalIncreaseData[] {
    const items = this._parseSermayeResponse(data);
    const records: CapitalIncreaseData[] = [];

    for (const item of items) {
      try {
        const tip = item.SHT_KODU as string;
        if (!["01", "02", "03", "09"].includes(tip)) continue;

        const timestamp = Number(item.SHHE_TARIH);
        if (!timestamp) continue;

        const dt = new Date(timestamp);
        dt.setHours(0, 0, 0, 0);

        records.push({
          date: dt,
          capital: Number(item.HSP_BOLUNME_SONRASI_SERMAYE) || 0,
          rightsIssue: Number(Number(item.SHHE_BDLI_ORAN || 0).toFixed(2)),
          bonusFromCapital: Number(
            Number(item.SHHE_BDSZ_IK_ORAN || 0).toFixed(2),
          ),
          bonusFromDividend: Number(
            Number(item.SHHE_BDSZ_TM_ORAN || 0).toFixed(2),
          ),
        });
      } catch {
        continue;
      }
    }
    return records.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  private _getPeriods(
    currentYear: number,
    quarterly: boolean,
    count: number = 5,
  ): { year: number; period: number }[] {
    const periods: { year: number; period: number }[] = [];
    if (quarterly) {
      const currentMonth = new Date().getMonth() + 1;
      let startYear = currentYear;
      let startPeriod = 12;

      // Determine latest available period
      if (currentMonth <= 2) {
        startYear = currentYear - 1;
        startPeriod = 9;
      } else if (currentMonth <= 5) {
        startYear = currentYear - 1;
        startPeriod = 12;
      } else if (currentMonth <= 8) {
        startYear = currentYear;
        startPeriod = 3;
      } else if (currentMonth <= 11) {
        startYear = currentYear;
        startPeriod = 6;
      } else {
        startYear = currentYear;
        startPeriod = 9;
      }

      let year = startYear;
      let period = startPeriod;

      for (let i = 0; i < count * 4; i++) {
        periods.push({ year, period });
        period -= 3;
        if (period <= 0) {
          period = 12;
          year -= 1;
        }
      }
    } else {
      for (let i = 0; i < count; i++) {
        periods.push({ year: currentYear - 1 - i, period: 12 });
      }
    }
    return periods;
  }

  private async _fetchFinancialTable(
    symbol: string,
    tableName: string,
    financialGroup: string,
    periods: { year: number; period: number }[],
  ): Promise<Record<string, unknown>[]> {
    const url = `${IsYatirimProvider.BASE_URL}/Data.aspx/MaliTablo`;

    // Build params
    const params: Record<string, unknown> = {
      companyCode: symbol,
      exchange: "TRY",
      financialGroup,
    };

    periods.slice(0, 5).forEach((p, i) => {
      params[`year${i + 1}`] = p.year;
      params[`period${i + 1}`] = p.period;
    });

    try {
      const response = await this.client.get(url, { params });
      return this._parseFinancialResponse(response.data, periods);
    } catch (e) {
      throw new APIError(
        `Failed to fetch financial table for ${symbol}: ${(e as Error).message}`,
      );
    }
  }

  private _parseFinancialResponse(
    data: Record<string, unknown>,
    periods: { year: number; period: number }[],
  ): Record<string, unknown>[] {
    if (!data || typeof data !== "object") return [];

    const items = data.value as Array<Record<string, unknown>>;
    if (!items || !Array.isArray(items)) return [];

    const isQuarterly = new Set(periods.map((p) => p.period)).size > 1;

    return items.map((item) => {
      const rowName = (item.itemDescTr ||
        item.itemDescEng ||
        "Unknown") as string;
      const rowData: Record<string, unknown> = { Item: rowName };

      periods.slice(0, 5).forEach((p, i) => {
        let colName = "";
        if (isQuarterly) {
          colName = `${p.year}Q${Math.floor(p.period / 3)}`;
        } else {
          colName = `${p.year}`;
        }

        const key = `value${i + 1}`;
        let value = item[key];

        // Try convert to number if possible
        if (value !== null && value !== undefined) {
          const num = Number(value);
          if (!isNaN(num)) value = num;
        }

        rowData[colName] = value;
      });

      return rowData;
    });
  }
}

// Singleton
let provider: IsYatirimProvider | null = null;
export function getIsYatirimProvider(): IsYatirimProvider {
  if (!provider) {
    provider = new IsYatirimProvider();
  }
  return provider;
}
