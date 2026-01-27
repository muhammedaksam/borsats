import * as cheerio from "cheerio";

import { APIError, DataNotAvailableError } from "~/exceptions";
import { BaseProvider } from "~/providers/base";
import { BankRate, CurrentData, InstitutionRate, OHLCVData } from "~/types";
import { TTL } from "~/utils/helpers";

/**
 * Canlidoviz provider for forex data from canlidoviz.com.
 *
 * Key advantage: No authentication token required!
 *
 * Supports:
 * - Currency history (USD, EUR, GBP, etc.)
 * - Bank-specific currency rates and history
 * - Precious metal rates (gram-altin, etc.)
 */
export class CanlidovizProvider extends BaseProvider {
  private static readonly API_BASE = "https://a.canlidoviz.com";
  private static readonly WEB_BASE = "https://canlidoviz.com";

  // Main currency IDs (TRY prices) - 65 currencies
  // Discovered via Chrome DevTools network inspection on 2026-01-13
  public static readonly CURRENCY_IDS: Record<string, number> = {
    // Major currencies
    USD: 1, // ABD Doları
    EUR: 50, // Euro
    GBP: 100, // İngiliz Sterlini
    CHF: 51, // İsviçre Frangı
    CAD: 56, // Kanada Doları
    AUD: 102, // Avustralya Doları
    JPY: 57, // 100 Japon Yeni
    NZD: 67, // Yeni Zelanda Doları
    SGD: 17, // Singapur Doları
    HKD: 80, // Hong Kong Doları
    TWD: 9, // Yeni Tayvan Doları
    // European currencies
    DKK: 54, // Danimarka Kronu
    SEK: 60, // İsveç Kronu
    NOK: 99, // Norveç Kronu
    PLN: 110, // Polonya Zlotisi
    CZK: 69, // Çek Korunası
    HUF: 108, // Macar Forinti
    RON: 77, // Romanya Leyi
    BGN: 71, // Bulgar Levası
    HRK: 116, // Hırvat Kunası
    RSD: 7, // Sırbistan Dinarı
    BAM: 82, // Bosna Hersek Markı
    MKD: 21, // Makedon Dinarı
    ALL: 112, // Arnavutluk Leki
    MDL: 10, // Moldovya Leusu
    UAH: 8, // Ukrayna Grivnası
    BYR: 109, // Belarus Rublesi
    ISK: 83, // İzlanda Kronası
    // Middle East & Africa
    AED: 53, // BAE Dirhemi
    SAR: 61, // Suudi Arabistan Riyali
    QAR: 5, // Katar Riyali
    KWD: 104, // Kuveyt Dinarı
    BHD: 64, // Bahreyn Dinarı
    OMR: 2, // Umman Riyali
    JOD: 92, // Ürdün Dinarı
    IQD: 106, // Irak Dinarı
    IRR: 68, // İran Riyali
    LBP: 117, // Lübnan Lirası
    SYP: 6, // Suriye Lirası
    EGP: 111, // Mısır Lirası
    LYD: 101, // Libya Dinarı
    TND: 885, // Tunus Dinarı
    DZD: 88, // Cezayir Dinarı
    MAD: 89, // Fas Dirhemi
    ZAR: 59, // Güney Afrika Randı
    ILS: 63, // İsrail Şekeli
    // Asia & Pacific
    CNY: 107, // Çin Yuanı
    INR: 103, // Hindistan Rupisi
    PKR: 29, // Pakistan Rupisi
    LKR: 87, // Sri Lanka Rupisi
    IDR: 105, // Endonezya Rupiahı
    MYR: 3, // Malezya Ringgiti
    THB: 39, // Tayland Bahtı
    PHP: 4, // Filipinler Pesosu
    KRW: 113, // Güney Kore Wonu
    KZT: 85, // Kazak Tengesi
    AZN: 75, // Azerbaycan Manatı
    GEL: 162, // Gürcistan Larisi
    // Americas
    MXN: 65, // Meksika Pesosu
    BRL: 74, // Brezilya Reali
    ARS: 73, // Arjantin Pesosu
    CLP: 76, // Şili Pesosu
    COP: 114, // Kolombiya Pesosu
    PEN: 13, // Peru İnti
    UYU: 25, // Uruguay Pesosu
    CRC: 79, // Kostarika Kolonu
    // Other
    RUB: 97, // Rus Rublesi
    DVZSP1: 783, // Sepet Kur (Döviz Sepeti)
  };

  // Precious metal IDs (TRY prices)
  // Note: These IDs were verified against canlidoviz.com pages on 2026-01-13
  public static readonly METAL_IDS: Record<string, number> = {
    "gram-altin": 32, // ~6,300 TRY (altin-fiyatlari/gram-altin)
    "ceyrek-altin": 11, // ~10,500 TRY
    "yarim-altin": 47, // ~21,000 TRY
    "tam-altin": 14, // ~42,000 TRY
    "cumhuriyet-altin": 27, // ~43,000 TRY
    "ata-altin": 43, // ~43,000 TRY
    "gram-gumus": 20, // ~115 TRY (altin-fiyatlari/gumus)
    "ons-altin": 81, // ~104,000 TRY (ons in TRY)
    "gram-platin": 1012, // ~3,260 TRY (emtia-fiyatlari/platin-gram)
  };

  // Energy IDs (USD prices)
  // Verified via Chrome DevTools network inspection on 2026-01-13
  public static readonly ENERGY_IDS: Record<string, number> = {
    BRENT: 266, // Brent Petrol ~$64 (emtia-fiyatlari/brent-petrol)
  };

  // Commodity IDs - Precious metals in USD (emtia)
  // Verified via Chrome DevTools network inspection on 2026-01-13
  public static readonly COMMODITY_IDS: Record<string, number> = {
    "XAG-USD": 267, // Silver Ounce (emtia-fiyatlari/gumus-ons)
    "XPT-USD": 268, // Platinum Spot (emtia-fiyatlari/platin-spot-dolar)
    "XPD-USD": 269, // Palladium Spot (emtia-fiyatlari/paladyum-spot-dolar)
  };

  // Bank-specific USD IDs
  private static readonly BANK_USD_IDS: Record<string, number> = {
    akbank: 822,
    "garanti-bbva": 805,
    "is-bankasi": 1020,
    "ziraat-bankasi": 264,
    halkbank: 1017,
    "yapi-kredi": 819,
    vakifbank: 1018,
    denizbank: 1019,
    "ing-bank": 1023,
    hsbc: 1025,
    teb: 1024,
    "qnb-finansbank": 788,
    "merkez-bankasi": 1016,
    "kapali-carsi": 1114,
    "kuveyt-turk": 1021,
    "albaraka-turk": 1022,
    sekerbank: 1113,
    enpara: 824,
  };

  // Bank-specific EUR IDs
  private static readonly BANK_EUR_IDS: Record<string, number> = {
    akbank: 1341,
    "garanti-bbva": 807,
    "is-bankasi": 1030,
    "ziraat-bankasi": 894,
    "merkez-bankasi": 1026,
    halkbank: 1027,
    "yapi-kredi": 820,
    vakifbank: 1028,
    denizbank: 1029,
    "ing-bank": 1033,
    hsbc: 1035,
    teb: 1034,
    "qnb-finansbank": 789,
    "kapali-carsi": 1115,
    "kuveyt-turk": 1031,
    "albaraka-turk": 1032,
  };

  // Bank-specific GBP IDs (18 banka - halkbank hariç veri yok)
  private static readonly BANK_GBP_IDS: Record<string, number> = {
    akbank: 1342,
    "albaraka-turk": 1329,
    denizbank: 1376,
    destekbank: 1338,
    fibabanka: 1410,
    "garanti-bbva": 809,
    hsbc: 1417,
    "ing-bank": 1427,
    "is-bankasi": 1485,
    "kapali-carsi": 1116,
    "kuveyt-turk": 841,
    "merkez-bankasi": 1036,
    "qnb-finansbank": 791,
    sekerbank: 1289,
    teb: 1288,
    vakifbank: 1460,
    "yapi-kredi": 1475,
    "ziraat-bankasi": 896,
  };

  // Bank-specific CHF IDs
  private static readonly BANK_CHF_IDS: Record<string, number> = {
    akbank: 1351,
    "albaraka-turk": 1330,
    denizbank: 1377,
    "is-bankasi": 1489,
    "kapali-carsi": 1199,
    "merkez-bankasi": 1440,
    vakifbank: 1461,
    "yapi-kredi": 1479,
    "ziraat-bankasi": 902,
  };

  // Bank-specific CAD IDs
  private static readonly BANK_CAD_IDS: Record<string, number> = {
    akbank: 1345,
    "is-bankasi": 1490,
    "kapali-carsi": 1204,
    "merkez-bankasi": 1442,
    "ziraat-bankasi": 899,
  };

  // Bank-specific AUD IDs
  private static readonly BANK_AUD_IDS: Record<string, number> = {
    akbank: 1343,
    "is-bankasi": 1486,
    "kapali-carsi": 1203,
    "merkez-bankasi": 1437,
    "ziraat-bankasi": 897,
  };

  // Bank-specific JPY IDs (100 Japon Yeni)
  private static readonly BANK_JPY_IDS: Record<string, number> = {
    "garanti-bbva": 814,
    "kapali-carsi": 1198,
    "merkez-bankasi": 1455,
    sekerbank: 1498,
    vakifbank: 1469,
    "ziraat-bankasi": 1286,
  };

  // Bank-specific RUB IDs (Rus Rublesi)
  private static readonly BANK_RUB_IDS: Record<string, number> = {
    akbank: 1352,
    "albaraka-turk": 1367,
    denizbank: 1384,
    "ing-bank": 1436,
    "kapali-carsi": 1206,
    "kuveyt-turk": 831,
    "merkez-bankasi": 1448,
    "qnb-finansbank": 801,
    vakifbank: 1462,
    "ziraat-bankasi": 901,
  };

  // Bank-specific SAR IDs (Suudi Arabistan Riyali)
  private static readonly BANK_SAR_IDS: Record<string, number> = {
    akbank: 1350,
    denizbank: 1401,
    hsbc: 1418,
    "ing-bank": 1434,
    "is-bankasi": 1493,
    "kapali-carsi": 1205,
    "kuveyt-turk": 842,
    "merkez-bankasi": 1445,
    "qnb-finansbank": 802,
    vakifbank: 1463,
    "yapi-kredi": 1483,
    "ziraat-bankasi": 903,
  };

  // Bank-specific AED IDs (BAE Dirhemi)
  private static readonly BANK_AED_IDS: Record<string, number> = {
    akbank: 1358,
    denizbank: 1385,
    "kapali-carsi": 1208,
    "merkez-bankasi": 1454,
  };

  // Bank-specific CNY IDs (Çin Yuanı)
  private static readonly BANK_CNY_IDS: Record<string, number> = {
    akbank: 1353,
    "kapali-carsi": 1210,
    "merkez-bankasi": 1449,
  };

  // Bank slug to dovizcom-compatible slug mapping
  private static readonly BANK_SLUG_MAP: Record<string, string> = {
    akbank: "akbank",
    "albaraka-turk": "albaraka",
    denizbank: "denizbank",
    destekbank: "destekbank",
    enpara: "enpara",
    fibabanka: "fibabanka",
    "garanti-bbva": "garanti",
    halkbank: "halkbank",
    hsbc: "hsbc",
    "ing-bank": "ing",
    "is-bankasi": "isbank",
    "kapali-carsi": "kapalicarsi",
    "kuveyt-turk": "kuveytturk",
    "merkez-bankasi": "tcmb",
    "qnb-finansbank": "qnb",
    sekerbank: "sekerbank",
    teb: "teb",
    vakifbank: "vakifbank",
    "yapi-kredi": "yapikredi",
    "ziraat-bankasi": "ziraat",
  };

  // Reverse mapping (dovizcom slug -> canlidoviz slug)
  private static readonly DOVIZCOM_TO_CANLIDOVIZ: Record<string, string> =
    Object.entries(CanlidovizProvider.BANK_SLUG_MAP).reduce(
      (acc, [k, v]) => {
        acc[v] = k;
        return acc;
      },
      {} as Record<string, string>,
    );

  // Currency code to URL slug mapping (for HTML scraping)
  private static readonly CURRENCY_SLUGS: Record<string, string> = {
    USD: "dolar",
    EUR: "euro",
    GBP: "ingiliz-sterlini",
    CHF: "isvicre-frangi",
    CAD: "kanada-dolari",
    AUD: "avustralya-dolari",
    JPY: "100-japon-yeni",
  };

  // Bank-specific metal IDs (gram-altin)
  // Verified via Chrome DevTools network inspection (January 2026)
  private static readonly BANK_GRAM_ALTIN_IDS: Record<string, number> = {
    "kapali-carsi": 1115,
    akbank: 823,
    "ziraat-bankasi": 1039,
    "is-bankasi": 1040,
    vakifbank: 1037,
    halkbank: 1036,
    "garanti-bankasi": 806,
    "yapi-kredi": 821,
    denizbank: 1038,
    albaraka: 1112,
    destekbank: 1339,
    enpara: 1041,
    fibabanka: 1300,
    hsbc: 1045,
    "ing-bank": 1043,
    "kuveyt-turk": 826,
    "qnb-finansbank": 789,
    sekerbank: 1042,
    teb: 1044,
  };

  // Bank-specific metal IDs (gumus/silver)
  // Verified via Chrome DevTools network inspection (January 2026)
  private static readonly BANK_GUMUS_IDS: Record<string, number> = {
    "kapali-carsi": 1181,
    akbank: 1359,
    albaraka: 1372,
    denizbank: 1378,
    destekbank: 1340,
    fibabanka: 1413,
    "garanti-bankasi": 1415,
    halkbank: 1416,
    hsbc: 1426,
    "kuveyt-turk": 827,
    "qnb-finansbank": 1456,
    vakifbank: 1474,
    "ziraat-bankasi": 1283,
  };

  // Bank-specific metal IDs (platin/platinum)
  // Verified via Chrome DevTools network inspection (January 2026)
  // Note: Only Kuveyt Türk provides platin institution rates on canlidoviz
  private static readonly BANK_PLATIN_IDS: Record<string, number> = {
    "kuveyt-turk": 1013,
  };

  constructor() {
    super({
      baseUrl: CanlidovizProvider.API_BASE,
      headers: {
        Accept: "*/*",
        Origin: CanlidovizProvider.WEB_BASE,
        Referer: `${CanlidovizProvider.WEB_BASE}/`,
      },
    });
  }

  private _getItemId(
    asset: string,
    institution: string | null = null,
  ): number | null {
    const assetUpper = asset.toUpperCase();

    if (institution) {
      // Convert dovizcom slug to canlidoviz slug if needed
      const instSlug =
        CanlidovizProvider.DOVIZCOM_TO_CANLIDOVIZ[institution] || institution;

      // Bank-specific ID
      if (assetUpper === "USD")
        return CanlidovizProvider.BANK_USD_IDS[instSlug];
      if (assetUpper === "EUR")
        return CanlidovizProvider.BANK_EUR_IDS[instSlug];
      if (assetUpper === "GBP")
        return CanlidovizProvider.BANK_GBP_IDS[instSlug];
      if (assetUpper === "CHF")
        return CanlidovizProvider.BANK_CHF_IDS[instSlug];
      if (assetUpper === "CAD")
        return CanlidovizProvider.BANK_CAD_IDS[instSlug];
      if (assetUpper === "AUD")
        return CanlidovizProvider.BANK_AUD_IDS[instSlug];
      if (assetUpper === "JPY")
        return CanlidovizProvider.BANK_JPY_IDS[instSlug];
      if (assetUpper === "RUB")
        return CanlidovizProvider.BANK_RUB_IDS[instSlug];
      if (assetUpper === "SAR")
        return CanlidovizProvider.BANK_SAR_IDS[instSlug];
      if (assetUpper === "AED")
        return CanlidovizProvider.BANK_AED_IDS[instSlug];
      if (assetUpper === "CNY")
        return CanlidovizProvider.BANK_CNY_IDS[instSlug];
      if (asset === "gram-altin")
        return CanlidovizProvider.BANK_GRAM_ALTIN_IDS[instSlug];
      if (asset === "gumus") return CanlidovizProvider.BANK_GUMUS_IDS[instSlug];
      if (asset === "gram-platin")
        return CanlidovizProvider.BANK_PLATIN_IDS[instSlug];
      return null;
    }

    // Main asset ID
    if (CanlidovizProvider.CURRENCY_IDS[assetUpper]) {
      return CanlidovizProvider.CURRENCY_IDS[assetUpper];
    }
    if (CanlidovizProvider.METAL_IDS[asset]) {
      return CanlidovizProvider.METAL_IDS[asset];
    }
    if (CanlidovizProvider.ENERGY_IDS[assetUpper]) {
      return CanlidovizProvider.ENERGY_IDS[assetUpper];
    }
    if (CanlidovizProvider.COMMODITY_IDS[assetUpper]) {
      return CanlidovizProvider.COMMODITY_IDS[assetUpper];
    }

    return null;
  }

  /**
   * Format DateTime for API (YYYY-MM-DDTHH:mm:ss format without timezone)
   */
  private formatDateTime(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  }

  /**
   * Get historical OHLC data for a currency or metal.
   */
  async getHistory(options: {
    asset: string;
    start?: Date;
    end?: Date;
    institution?: string | null;
    period?: string; // Not used but kept for compatibility
  }): Promise<OHLCVData[]> {
    const { asset, start, end, institution } = options;
    const endDt = end || new Date();
    const startDt =
      start || new Date(endDt.getTime() - 30 * 24 * 60 * 60 * 1000);

    const fromTimestamp = Math.floor(startDt.getTime() / 1000);
    const toTimestamp = Math.floor(endDt.getTime() / 1000);
    const itemId = this._getItemId(asset, institution);
    if (!itemId) {
      if (institution) {
        throw new DataNotAvailableError(
          `No canlidoviz data for ${asset} from ${institution}`,
        );
      }
      throw new DataNotAvailableError(`Unsupported asset: ${asset}`);
    }

    const startDate = new Date(fromTimestamp * 1000);
    const endDate = new Date(toTimestamp * 1000);

    const cacheKey = `canlidoviz:history:${asset}:${institution}:${startDate.toISOString().split("T")[0]}:${endDate.toISOString().split("T")[0]}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as OHLCVData[];
    }

    try {
      const url = `${CanlidovizProvider.API_BASE}/items/history`;
      const params = {
        period: "DAILY",
        itemDataId: itemId.toString(),
        startDate: this.formatDateTime(startDate),
        endDate: this.formatDateTime(endDate),
      };

      const response = await this.client.get(url, { params });
      const data = response.data as Record<string, string>;

      const records: OHLCVData[] = [];
      for (const [tsStr, ohlcStr] of Object.entries(data)) {
        try {
          const ts = parseInt(tsStr);
          const values = ohlcStr.split("|");
          if (values.length >= 4) {
            records.push({
              date: new Date(ts * 1000),
              open: parseFloat(values[0]),
              high: parseFloat(values[1]),
              low: parseFloat(values[2]),
              close: parseFloat(values[3]),
              volume: 0,
            });
          }
        } catch {
          continue;
        }
      }

      const result = records.sort(
        (a, b) => a.date.getTime() - b.date.getTime(),
      );
      this.cache.set(cacheKey, result, TTL.OHLCV_HISTORY);
      return result;
    } catch (e) {
      throw new APIError(
        `Failed to fetch canlidoviz history for ${asset}: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Get current price for a currency or metal.
   */
  async getCurrentRate(
    asset: string,
    institution: string | null = null,
  ): Promise<CurrentData> {
    const itemId = this._getItemId(asset, institution);
    if (!itemId) {
      throw new DataNotAvailableError(`Unsupported asset: ${asset}`);
    }

    const cacheKey = `canlidoviz:current:${asset}:${institution}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as CurrentData;
    }

    try {
      // Get recent history to extract latest price
      const now = Math.floor(Date.now() / 1000);
      const fiveDaysAgo = now - 5 * 24 * 60 * 60;

      const history = await this.getHistory({
        asset,
        start: new Date(fiveDaysAgo * 1000),
        end: new Date(now * 1000),
        institution,
      });
      if (history.length === 0) {
        throw new DataNotAvailableError(`No data for ${asset}`);
      }

      const latest = history[history.length - 1];
      const result: CurrentData = {
        symbol: `${asset}/TRY`,
        last: latest.close,
        open: latest.open,
        high: latest.high,
        low: latest.low,
        close: latest.close,
        volume: latest.volume,
        updateTime: latest.date,
      };

      this.cache.set(cacheKey, result, TTL.FX_RATES);
      return result;
    } catch (e) {
      throw new APIError(
        `Failed to fetch current price for ${asset}: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Get list of supported currencies.
   */
  getSupportedCurrencies(): string[] {
    return Object.keys(CanlidovizProvider.CURRENCY_IDS).sort();
  }

  /**
   * Get list of supported metals.
   */
  getSupportedMetals(): string[] {
    return Object.keys(CanlidovizProvider.METAL_IDS).sort();
  }

  /**
   * Get list of supported banks for a currency.
   */
  getSupportedBanks(currency: string = "USD"): string[] {
    const currencyUpper = currency.toUpperCase();
    if (currencyUpper === "USD")
      return Object.keys(CanlidovizProvider.BANK_USD_IDS).sort();
    if (currencyUpper === "EUR")
      return Object.keys(CanlidovizProvider.BANK_EUR_IDS).sort();
    if (currencyUpper === "GBP")
      return Object.keys(CanlidovizProvider.BANK_GBP_IDS).sort();
    if (currencyUpper === "CHF")
      return Object.keys(CanlidovizProvider.BANK_CHF_IDS).sort();
    if (currencyUpper === "CAD")
      return Object.keys(CanlidovizProvider.BANK_CAD_IDS).sort();
    if (currencyUpper === "AUD")
      return Object.keys(CanlidovizProvider.BANK_AUD_IDS).sort();
    if (currencyUpper === "JPY")
      return Object.keys(CanlidovizProvider.BANK_JPY_IDS).sort();
    if (currencyUpper === "RUB")
      return Object.keys(CanlidovizProvider.BANK_RUB_IDS).sort();
    if (currencyUpper === "SAR")
      return Object.keys(CanlidovizProvider.BANK_SAR_IDS).sort();
    if (currencyUpper === "AED")
      return Object.keys(CanlidovizProvider.BANK_AED_IDS).sort();
    if (currencyUpper === "CNY")
      return Object.keys(CanlidovizProvider.BANK_CNY_IDS).sort();
    return [];
  }

  /**
   * Get buy/sell rates from banks via HTML scraping.
   */
  async getBankRates(
    currency: string,
    bank: string | null = null,
  ): Promise<BankRate | BankRate[]> {
    const currencyUpper = currency.toUpperCase();
    const slug = CanlidovizProvider.CURRENCY_SLUGS[currencyUpper];

    if (!slug) {
      throw new DataNotAvailableError(
        `Bank rates not available for ${currency}. Supported: ${Object.keys(CanlidovizProvider.CURRENCY_SLUGS)}`,
      );
    }

    const cacheKey = `canlidoviz:bank_rates:${currency}`;
    let cached = this.cache.get(cacheKey);

    if (!cached) {
      const url = `${CanlidovizProvider.WEB_BASE}/doviz-kurlari/${slug}`;
      try {
        const response = await this.client.get(url);
        cached = this._parseBankRatesHtml(response.data, currency);
        this.cache.set(cacheKey, cached, TTL.FX_RATES);
      } catch (e) {
        throw new APIError(
          `Failed to fetch bank rates: ${(e as Error).message}`,
        );
      }
    }

    if (bank) {
      const bankSlug = CanlidovizProvider.DOVIZCOM_TO_CANLIDOVIZ[bank] || bank;
      const rate = (cached as BankRate[]).find((r) => r.bank === bankSlug);
      if (!rate) {
        throw new DataNotAvailableError(
          `Bank ${bank} not found for ${currency}`,
        );
      }
      return rate;
    }

    return cached as BankRate[];
  }

  private _parseBankRatesHtml(html: string, currency: string): BankRate[] {
    const $ = cheerio.load(html);
    const results: BankRate[] = [];

    const currencySlug =
      CanlidovizProvider.CURRENCY_SLUGS[currency.toUpperCase()] || "";
    // Use endsWith because href might be full URL or relative
    const pattern = new RegExp(`/doviz-kurlari/([^/]+)/${currencySlug}$`);

    $("a").each((_, element) => {
      const href = $(element).attr("href");
      if (!href) return;

      const match = pattern.exec(href);
      if (!match) return;

      const bankSlug = match[1];
      if (bankSlug === currencySlug) return;

      const bankText = $(element).text().trim();
      // Remove timestamp (e.g., "AKBANK15:57:42")
      const bankName = bankText.replace(/\s*\d{2}:\d{2}:\d{2}$/, "");

      const tdParent = $(element).closest("td");
      if (tdParent.length === 0) return;

      const siblingTds = tdParent.nextAll("td");
      if (siblingTds.length < 2) return;

      try {
        const buyText = $(siblingTds[0]).text().trim();
        const buy = parseFloat(buyText.replace(",", "."));

        const sellText = $(siblingTds[1]).text().trim();
        const sellMatch = sellText.match(/^(\d+[.,]\d+)/);
        if (!sellMatch) return;

        const sell = parseFloat(sellMatch[1].replace(",", "."));
        const spread =
          buy > 0 ? parseFloat((((sell - buy) / buy) * 100).toFixed(2)) : 0;

        results.push({
          bank: bankSlug,
          bankName: bankName,
          currency: currency,
          buy: buy,
          sell: sell,
          spread: spread,
        });
      } catch {
        return;
      }
    });

    return results;
  }

  /**
   * Get sell rates from institutions (gold/silver).
   */
  async getInstitutionRates(
    asset: string,
    _institution: string | null = null,
  ): Promise<InstitutionRate[]> {
    // Stub implementation
    return [];
  }
}

// Singleton
let provider: CanlidovizProvider | null = null;

export function getCanliDovizProvider(): CanlidovizProvider {
  if (!provider) {
    provider = new CanlidovizProvider();
  }
  return provider;
}
