import https from "https";
import { APIError, DataNotAvailableError } from "@/exceptions";
import { BaseProvider } from "@/providers/base";
import { TTL } from "@/utils/helpers";

export interface FundDetail {
  fund_code: string;
  name: string;
  date: string;
  price: number;
  fund_size: number;
  investor_count: number;
  founder: string;
  manager: string;
  fund_type: string;
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
  // Profile
  isin?: string;
  last_trading_time?: string;
  min_purchase?: string;
  min_redemption?: string;
  entry_fee?: number;
  exit_fee?: number;
  kap_link?: string;
  allocation?: Array<{
    asset_type: string;
    asset_name: string;
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
  asset_type: string;
  asset_name: string;
  weight: number;
}

export class TEFASProvider extends BaseProvider {
  private static readonly BASE_URL = "https://www.tefas.gov.tr/api/DB";
  private static readonly MAX_CHUNK_DAYS = 90;

  // Asset type mappings
  private static readonly ASSET_TYPE_MAPPING: Record<string, string> = {
    BB: "Banka Bonosu",
    BYF: "Borsa Yatırım Fonu",
    D: "Döviz",
    DB: "Devlet Bonusu",
    DT: "Devlet Tahvili",
    DÖT: "Döviz Ödenekli Tahvil",
    EUT: "Eurobond Tahvil",
    FB: "Finansman Bonosu",
    FKB: "Fon Katılma Belgesi",
    GAS: "Gümüş",
    GSYKB: "Girişim Sermayesi Yatırım Katılma Belgesi",
    GSYY: "Girişim Sermayesi Yatırım",
    GYKB: "Gayrimenkul Yatırım Katılma Belgesi",
    GYY: "Gayrimenkul Yatırım",
    HB: "Hazine Bonosu",
    HS: "Hisse Senedi",
    KBA: "Kira Sertifikası Alım",
    KH: "Katılım Hesabı",
    KHAU: "Katılım Hesabı ABD Doları",
    KHD: "Katılım Hesabı Döviz",
    KHTL: "Katılım Hesabı Türk Lirası",
    KKS: "Kira Sertifikası",
    KKSD: "Kira Sertifikası Döviz",
    KKSTL: "Kira Sertifikası Türk Lirası",
    KKSYD: "Kira Sertifikası Yabancı Döviz",
    KM: "Kıymetli Maden",
    KMBYF: "Kıymetli Maden Borsa Yatırım Fonu",
    KMKBA: "Kıymetli Maden Katılma Belgesi Alım",
    KMKKS: "Kıymetli Maden Kira Sertifikası",
    KİBD: "Kira Sertifikası İpotekli Borçlanma",
    OSKS: "Özel Sektör Kira Sertifikası",
    OST: "Özel Sektör Tahvili",
    R: "Repo",
    T: "Tahvil",
    TPP: "Ters Repo Para Piyasası",
    TR: "Ters Repo",
    VDM: "Vadeli Mevduat",
    VM: "Vadesiz Mevduat",
    VMAU: "Vadesiz Mevduat ABD Doları",
    VMD: "Vadesiz Mevduat Döviz",
    VMTL: "Vadesiz Mevduat Türk Lirası",
    VİNT: "Varlık İpotek Tahvil",
    YBA: "Yabancı Borçlanma Araçları",
    YBKB: "Yabancı Borsa Katılma Belgesi",
    YBOSB: "Yabancı Borsa Özel Sektör Bonusu",
    YBYF: "Yabancı Borsa Yatırım Fonu",
    YHS: "Yabancı Hisse Senedi",
    YMK: "Yabancı Menkul Kıymet",
    YYF: "Yabancı Yatırım Fonu",
    ÖKSYD: "Özel Sektör Kira Sertifikası Yabancı Döviz",
    ÖSDB: "Özel Sektör Devlet Bonusu",
  };

  private static readonly ASSET_NAME_STANDARDIZATION: Record<string, string> = {
    "Hisse Senedi": "Stocks",
    "Ters-Repo": "Reverse Repo",
    "Finansman Bonosu": "Commercial Paper",
    "Özel Sektör Tahvili": "Corporate Bonds",
    "Mevduat (TL)": "TL Deposits",
    "Yatırım Fonları Katılma Payları": "Fund Shares",
    "Girişim Sermayesi Yatırım Fonları Katılma Payları": "VC Fund Shares",
    "Vadeli İşlemler Nakit Teminatları": "Futures Margin",
    Diğer: "Other",
    "Devlet Tahvili": "Government Bonds",
    "Hazine Bonosu": "Treasury Bills",
    "Kıymetli Maden": "Precious Metals",
    Döviz: "Foreign Currency",
    Repo: "Repo",
  };

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
   * Get detailed information about a fund.
   */
  async getFundDetail(fundCode: string): Promise<FundDetail> {
    const code = fundCode.toUpperCase();
    const cacheKey = `tefas:detail:${code}`;

    const cached = this.cache.get(cacheKey);
    if (cached) return cached as FundDetail;

    const url = `${TEFASProvider.BASE_URL}/GetAllFundAnalyzeData`;
    const data = `dil=TR&fonkod=${code}`;

    const headers = {
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
      Accept: "application/json, text/plain, */*",
    };

    try {
      const response = await this.client.post(url, data, { headers });
      const result = response.data;

      if (!result || !result.fundInfo || result.fundInfo.length === 0) {
        throw new DataNotAvailableError(`No data for fund: ${code}`);
      }

      const info = result.fundInfo[0];
      if (!info.FONUNVAN) {
        throw new DataNotAvailableError(`Fund not found: ${code}`);
      }
      const returns = (result.fundReturn && result.fundReturn[0]) || {};
      const profile = (result.fundProfile && result.fundProfile[0]) || {};
      const rawAllocation = result.fundAllocation || [];

      // Parse allocation
      const allocation: Array<{
        asset_type: string;
        asset_name: string;
        weight: number;
      }> = [];

      for (const item of rawAllocation) {
        const weight = parseFloat(item.PORTFOYORANI || "0");
        if (weight > 0) {
          const typeTr = item.KIYMETTIP || "";
          const stdName =
            TEFASProvider.ASSET_NAME_STANDARDIZATION[typeTr] || typeTr;
          allocation.push({
            asset_type: typeTr,
            asset_name: stdName,
            weight,
          });
        }
      }
      allocation.sort((a, b) => b.weight - a.weight);

      const detail: FundDetail = {
        fund_code: code,
        name: info.FONUNVAN,
        date: info.TARIH,
        price: Number(info.SONFIYAT || 0),
        fund_size: Number(info.PORTBUYUKLUK || 0),
        investor_count: Number(info.YATIRIMCISAYI || 0),
        founder: info.KURUCU,
        manager: info.YONETICI,
        fund_type: info.FONTUR || info.FONTURACIKLAMA || info.FONKATEGORI,
        category: info.FONKATEGORI,
        risk_value: Number(info.RISKDEGERI || 0),
        // Returns
        return_1m: info.GETIRI1A, // info often has these too, or fundReturn
        return_3m: returns.GETIRI3A,
        return_6m: returns.GETIRI6A,
        return_ytd: returns.GETIRIYB,
        return_1y: returns.GETIRI1Y,
        return_3y: returns.GETIRI3Y,
        return_5y: returns.GETIRI5Y,
        daily_return: info.GUNLUKGETIRI,
        weekly_return: info.HAFTALIKGETIRI,
        // Profile
        isin: profile.ISINKOD,
        last_trading_time: profile.SONISSAAT,
        min_purchase: profile.MINALIS,
        min_redemption: profile.MINSATIS,
        entry_fee: profile.GIRISKOMISYONU,
        exit_fee: profile.CIKISKOMISYONU,
        kap_link: profile.KAPLINK,
        allocation,
      };

      this.cache.set(cacheKey, detail, TTL.FX_RATES);
      return detail;
    } catch (e) {
      if (e instanceof DataNotAvailableError) throw e;
      throw new APIError(
        `Failed to fetch fund detail for ${code}: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Get historical price data for a fund.
   */
  async getHistory(options: {
    fundCode: string;
    period?: string;
    start?: Date;
    end?: Date;
  }): Promise<FundHistoryItem[]> {
    const { fundCode, period = "1mo", start, end } = options;
    const code = fundCode.toUpperCase();
    const endDt = end || new Date();
    let startDt = start;

    if (!startDt) {
      const daysMap: Record<string, number> = {
        "1d": 1,
        "5d": 5,
        "1mo": 30,
        "3mo": 90,
        "6mo": 180,
        "1y": 365,
        "3y": 1095,
        "5y": 1825,
        max: 1825,
      };
      const days = daysMap[period] || 30;
      startDt = new Date(endDt.getTime() - days * 24 * 60 * 60 * 1000);
    }

    const startStr = this._formatDateISO(startDt!);
    const endStr = this._formatDateISO(endDt);
    const cacheKey = `tefas:history:${code}:${startStr}:${endStr}`;

    const cached = this.cache.get(cacheKey);
    if (cached) return cached as FundHistoryItem[];

    const diffDays = Math.ceil(
      (endDt.getTime() - startDt!.getTime()) / (1000 * 60 * 60 * 24),
    );

    let df: FundHistoryItem[] = [];
    if (diffDays > TEFASProvider.MAX_CHUNK_DAYS) {
      df = await this._getHistoryChunked(code, startDt!, endDt);
    } else {
      df = await this._fetchHistoryChunk(code, startDt!, endDt);
    }

    this.cache.set(cacheKey, df, TTL.OHLCV_HISTORY);
    return df;
  }

  /**
   * Get portfolio allocation (asset breakdown) for a fund.
   */
  async getAllocation(
    fundCode: string,
    start?: Date,
    end?: Date,
  ): Promise<AllocationItem[]> {
    const code = fundCode.toUpperCase();
    const endDt = end || new Date();
    const startDt =
      start || new Date(endDt.getTime() - 7 * 24 * 60 * 60 * 1000);

    const cacheKey = `tefas:allocation:${code}:${this._formatDateISO(startDt)}:${this._formatDateISO(endDt)}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached as AllocationItem[];

    const url = `${TEFASProvider.BASE_URL}/BindHistoryAllocation`;

    const body = new URLSearchParams({
      fontip: "YAT",
      sfontur: "",
      fonkod: code,
      fongrup: "",
      bastarih: this._formatDateTR(startDt),
      bittarih: this._formatDateTR(endDt),
      fonturkod: "",
      fonunvantip: "",
      kurucukod: "",
    });

    try {
      const response = await this.client.post(url, body, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
        },
      });

      const result = response.data;
      if (!result || !result.data) {
        throw new DataNotAvailableError(`No allocation data for fund: ${code}`);
      }

      const records: AllocationItem[] = [];
      for (const item of result.data) {
        const timestamp = Number(item.TARIH);
        if (timestamp > 0) {
          const dt = new Date(timestamp); // TEFAS returns millis

          for (const [key, value] of Object.entries(item)) {
            if (["TARIH", "FONKODU", "FONUNVAN", "BilFiyat"].includes(key))
              continue;

            const weight = parseFloat(value as string);
            if (weight > 0) {
              const assetName = TEFASProvider.ASSET_TYPE_MAPPING[key] || key;
              records.push({
                date: dt,
                asset_type: key,
                asset_name: assetName,
                weight,
              });
            }
          }
        }
      }

      records.sort((a, b) => {
        if (a.date.getTime() !== b.date.getTime())
          return b.date.getTime() - a.date.getTime();
        return b.weight - a.weight;
      });

      this.cache.set(cacheKey, records, TTL.FX_RATES);
      return records;
    } catch (err) {
      if (err instanceof DataNotAvailableError) throw err;
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
  }): Promise<AllocationItem[]> {
    const { fundCode, period = "1mo", start, end } = options;

    let endDt = end || new Date();
    let startDt: Date;

    if (start) {
      startDt = start;
    } else {
      const periodDays: Record<string, number> = {
        "1w": 7,
        "1mo": 30,
        "3mo": 90,
      };
      const days = periodDays[period] || 30;
      startDt = new Date(endDt.getTime() - days * 24 * 60 * 60 * 1000);
    }

    // TEFAS supports max ~100 days
    const maxDays = 100;
    const diffDays = Math.floor(
      (endDt.getTime() - startDt.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (diffDays > maxDays) {
      startDt = new Date(endDt.getTime() - maxDays * 24 * 60 * 60 * 1000);
    }

    return this.getAllocation(fundCode, startDt, endDt);
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
    const url = `${TEFASProvider.BASE_URL}/BindComparisonFundReturns`;

    // Using comparison endpoint to search (gets all funds)
    const body = new URLSearchParams({
      calismatipi: "2",
      fontip: "YAT",
      sfontur: "Tümü",
      kurucukod: "",
      fongrup: "",
      bastarih: "Başlangıç",
      bittarih: "Bitiş",
      fonturkod: "",
      fonunvantip: "",
      strperiod: "1,1,1,1,1,1,1",
      islemdurum: "1",
    });

    try {
      const response = await this.client.post(url, body, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
        },
      });

      const result = response.data;
      const allFunds = result.data || [];
      const queryLower = query.toLocaleLowerCase("tr-TR");

      const matching = [];
      for (const fund of allFunds) {
        if (matching.length >= limit) break;

        const code = (fund.FONKODU || "").toLocaleLowerCase("tr-TR");
        const name = (fund.FONUNVAN || "").toLocaleLowerCase("tr-TR");

        if (code.includes(queryLower) || name.includes(queryLower)) {
          matching.push({
            fund_code: fund.FONKODU,
            name: fund.FONUNVAN,
            fund_type: fund.FONTURACIKLAMA,
            return_1y: fund.GETIRI1Y,
          });
        }
      }
      return matching;
    } catch (err) {
      throw new APIError(`Search failed: ${(err as Error).message}`);
    }
  }

  // --- Helpers ---

  private async _getHistoryChunked(
    code: string,
    start: Date,
    end: Date,
  ): Promise<FundHistoryItem[]> {
    const allRecords: FundHistoryItem[] = [];
    let chunkStart = new Date(start);

    while (chunkStart < end) {
      const chunkEnd = new Date(
        Math.min(
          chunkStart.getTime() +
            TEFASProvider.MAX_CHUNK_DAYS * 24 * 60 * 60 * 1000,
          end.getTime(),
        ),
      );

      try {
        if (allRecords.length > 0) {
          await new Promise((r) => setTimeout(r, 300)); // Rate limit buffer
        }

        const chunk = await this._fetchHistoryChunk(code, chunkStart, chunkEnd);
        allRecords.push(...chunk);
      } catch (err) {
        // Continue if chunk fails (might be empty)
      }

      chunkStart = new Date(chunkEnd.getTime() + 24 * 60 * 60 * 1000); // +1 day
    }

    if (allRecords.length === 0) {
      throw new DataNotAvailableError(`No history for fund: ${code}`);
    }

    // Deduplicate and sort
    const unique = new Map<number, FundHistoryItem>();
    allRecords.forEach((r) => unique.set(r.date.getTime(), r));

    return Array.from(unique.values()).sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
  }

  private async _fetchHistoryChunk(
    code: string,
    start: Date,
    end: Date,
  ): Promise<FundHistoryItem[]> {
    const url = `${TEFASProvider.BASE_URL}/BindHistoryInfo`;

    const body = new URLSearchParams({
      fontip: "YAT",
      sfontur: "",
      fonkod: code,
      fongrup: "",
      bastarih: this._formatDateTR(start),
      bittarih: this._formatDateTR(end),
      fonturkod: "",
      fonunvantip: "",
      kurucukod: "",
    });

    const headers = {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: "https://www.tefas.gov.tr/TarihselVeriler.aspx",
    };

    try {
      const response = await this.client.post(url, body, { headers });

      // Check WAF block (HTML response)
      if (
        typeof response.data === "string" &&
        response.data.includes("<!DOCTYPE html>")
      ) {
        throw new APIError("TEFAS WAF blocked the request");
      }

      const result = response.data;
      if (!result.data) return [];

      const records: FundHistoryItem[] = [];
      for (const item of result.data) {
        const timestamp = Number(item.TARIH);
        if (timestamp > 0) {
          records.push({
            date: new Date(timestamp),
            price: Number(item.FIYAT || 0),
            fundSize: Number(item.PORTFOYBUYUKLUK || 0),
            investors: Number(item.KISISAYISI || 0),
          });
        }
      }
      return records;
    } catch (err) {
      if ((err as Error).message.includes("WAF")) throw err;
      throw new APIError(`Failed chunk fetch: ${(err as Error).message}`);
    }
  }

  private _formatDateISO(date: Date): string {
    return date.toISOString().split("T")[0];
  }

  async screenFunds(_options: unknown): Promise<unknown[]> {
    return [];
  }

  private _formatDateTR(date: Date): string {
    const d = String(date.getDate()).padStart(2, "0");
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const y = date.getFullYear();
    return `${d}.${m}.${y}`;
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
