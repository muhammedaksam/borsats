import { getBistIndexProvider } from "@/providers/bist-index";
import { getTradingViewProvider } from "@/providers/tradingview";
import {
  IndexComponent,
  IndexInfo,
  Interval,
  OHLCVData,
  Period,
} from "@/types";

/**
 * Known market indices with their names
 */
export const INDICES: Record<string, { name: string }> = {
  // Main indices
  XU100: { name: "BIST 100" },
  XU050: { name: "BIST 50" },
  XU030: { name: "BIST 30" },
  XUTUM: { name: "BIST Tüm" },
  // Participation (Katılım) indices
  XKTUM: { name: "BIST Katılım Tüm" },
  XK100: { name: "BIST Katılım 100" },
  XK050: { name: "BIST Katılım 50" },
  XK030: { name: "BIST Katılım 30" },
  XKTMT: { name: "BIST Katılım Model Portföy" },
  // Sector indices
  XBANK: { name: "BIST Banka" },
  XUSIN: { name: "BIST Sınai" },
  XUMAL: { name: "BIST Mali" },
  XHOLD: { name: "BIST Holding ve Yatırım" },
  XUTEK: { name: "BIST Teknoloji" },
  XGIDA: { name: "BIST Gıda" },
  XTRZM: { name: "BIST Turizm" },
  XULAS: { name: "BIST Ulaştırma" },
  XSGRT: { name: "BIST Sigorta" },
  XMANA: { name: "BIST Metal Ana" },
  XKMYA: { name: "BIST Kimya" },
  XMADN: { name: "BIST Maden" },
  XELKT: { name: "BIST Elektrik" },
  XTEKS: { name: "BIST Tekstil" },
  XILTM: { name: "BIST İletişim" },
  // Thematic indices
  XSRDK: { name: "BIST Sürdürülebilirlik" },
  XKURY: { name: "BIST Kurumsal Yönetim" },
  XYLDZ: { name: "BIST Yıldız" },
  XBANA: { name: "BIST Banka Dışı Likit 10" },
  XSPOR: { name: "BIST Spor" },
  XGMYO: { name: "BIST GYO" },
  XTUMY: { name: "BIST Tüm-100" },
  XYORT: { name: "BIST Yatırım Ortaklıkları" },
  XSDNZ: { name: "BIST Seçme Divident" },
};

/**
 * Get list of popular indices
 *
 * @param detailed If true, returns detailed info including component count (async)
 */
export async function indices(
  detailed: boolean = false,
): Promise<string[] | Array<{ symbol: string; name: string; count: number }>> {
  if (!detailed) {
    return Object.keys(INDICES);
  }

  const provider = getBistIndexProvider();
  const available = await provider.getAvailableIndices();
  const countMap = new Map(available.map((item) => [item.symbol, item.count]));

  return Object.entries(INDICES).map(([symbol, info]) => ({
    symbol,
    name: info.name,
    count: countMap.get(symbol) || 0,
  }));
}

/**
 * Get all available BIST indices with component counts
 */
export async function allIndices(): Promise<
  Array<{
    symbol: string;
    name: string;
    count: number;
  }>
> {
  const provider = getBistIndexProvider();
  return provider.getAvailableIndices();
}

/**
 * Alias for creating Index instance
 */
export function index(symbol: string): Index {
  return new Index(symbol);
}

/**
 * Index class for BIST indices
 */
export class Index {
  public readonly symbol: string;

  constructor(symbol: string) {
    this.symbol = symbol.toUpperCase();
  }

  /**
   * Current index value and info
   */
  get info(): Promise<IndexInfo> {
    const provider = getTradingViewProvider();
    return provider.getCurrentQuote("BIST", this.symbol).then((data) => ({
      symbol: this.symbol,
      name: INDICES[this.symbol]?.name || this.symbol,
      value: data.last,
      change: data.change,
      changePercent: data.changePercent,
      updateTime: data.updateTime,
    }));
  }

  /**
   * Historical index data
   */
  async history(
    options: {
      period?: Period;
      interval?: Interval;
      start?: Date | string;
      end?: Date | string;
    } = {},
  ): Promise<OHLCVData[]> {
    const { period = "1mo", interval = "1d" } = options;

    const endDate = options.end ? new Date(options.end) : new Date();
    const startDate = options.start
      ? new Date(options.start)
      : this.calculateStartDate(period, endDate);

    const provider = getTradingViewProvider();
    return provider.getHistory({
      exchange: "BIST",
      symbol: this.symbol,
      interval,
      start: startDate,
      end: endDate,
    });
  }

  /**
   * Index components (constituent stocks)
   */
  get components(): Promise<IndexComponent[]> {
    const provider = getBistIndexProvider();
    return provider.getComponents(this.symbol);
  }

  /**
   * Component symbols only
   */
  async componentSymbols(): Promise<string[]> {
    const comps = await this.components;
    return comps.map((c) => c.symbol);
  }

  private calculateStartDate(period: Period, endDate: Date): Date {
    const periodDays: Record<string, number> = {
      "1d": 1,
      "5d": 5,
      "1w": 7,
      "1mo": 30,
      "3mo": 90,
      "6mo": 180,
      "1y": 365,
      "2y": 730,
      "5y": 1825,
    };

    const days = periodDays[period] || 30;
    const start = new Date(endDate);
    start.setDate(start.getDate() - days);
    return start;
  }
}
