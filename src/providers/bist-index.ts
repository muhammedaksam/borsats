import { DataNotAvailableError } from "~/exceptions";
import { BaseProvider } from "~/providers/base";
import { IndexComponent } from "~/types";
import { TTL } from "~/utils/helpers";

// BIST index components CSV URL
const INDEX_COMPONENTS_URL =
  "https://www.borsaistanbul.com/datum/hisse_endeks_ds.csv";

interface ComponentRow {
  symbol: string;
  name: string;
  index_code: string;
  index_name: string;
}

export interface IndexInfo {
  symbol: string;
  name: string;
  count: number;
}

export class BistIndexProvider extends BaseProvider {
  private dfCache: ComponentRow[] | null = null;

  constructor() {
    super({
      baseUrl: "https://www.borsaistanbul.com",
    });
  }

  /**
   * Download and cache the components CSV.
   */
  private async _downloadComponents(): Promise<ComponentRow[]> {
    if (this.dfCache) {
      return this.dfCache;
    }

    // Check memory cache first
    const cacheKey = "bist:index:components:all";
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.dfCache = cached as ComponentRow[];
      return this.dfCache;
    }

    try {
      const response = await this.client.get(INDEX_COMPONENTS_URL);
      const csvText = response.data as string;

      // Parse CSV (delimiter is semicolon)
      const lines = csvText.trim().split("\n");
      // Skip first row (English column names header)
      const dataLines = lines.slice(1);

      const rows: ComponentRow[] = [];
      for (const line of dataLines) {
        if (!line.trim()) continue;

        const columns = line.split(";");
        if (columns.length < 4) continue;

        // Column indices based on Python code:
        // "BILESEN KODU", "BULTEN_ADI", "ENDEKS KODU", "ENDEKS ADI"
        const bilesenKodu = columns[0]?.trim() || "";
        const bultenAdi = columns[1]?.trim() || "";
        const endeksKodu = columns[2]?.trim() || "";
        const endeksAdi = columns[3]?.trim() || "";

        if (!bilesenKodu || !endeksKodu) continue;

        // Clean up symbol codes (remove .E suffix)
        const symbol = bilesenKodu.replace(/\.E$/, "");

        rows.push({
          symbol,
          name: bultenAdi,
          index_code: endeksKodu,
          index_name: endeksAdi,
        });
      }

      this.dfCache = rows;
      this.cache.set(cacheKey, rows, TTL.COMPANY_LIST);
      return rows;
    } catch (e) {
      throw new DataNotAvailableError(
        `Failed to download index components: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Get constituent stocks for an index.
   *
   * @param symbol Index symbol (e.g., "XU100", "XU030", "XKTUM")
   * @returns List of components with symbol and name
   */
  async getComponents(symbol: string): Promise<IndexComponent[]> {
    const cleanSymbol = symbol.toUpperCase();
    const rows = await this._downloadComponents();

    return rows
      .filter((row) => row.index_code === cleanSymbol)
      .map((row) => ({
        symbol: row.symbol,
        name: row.name,
      }));
  }

  /**
   * Get list of all indices with component counts.
   *
   * @returns List of indices with symbol, name, and count
   */
  async getAvailableIndices(): Promise<IndexInfo[]> {
    const rows = await this._downloadComponents();

    // Group by index code
    const indexMap = new Map<string, { name: string; count: number }>();

    for (const row of rows) {
      const existing = indexMap.get(row.index_code);
      if (existing) {
        existing.count++;
      } else {
        indexMap.set(row.index_code, {
          name: row.index_name,
          count: 1,
        });
      }
    }

    // Convert to array and sort
    const indices: IndexInfo[] = [];
    for (const [symbol, data] of indexMap.entries()) {
      indices.push({
        symbol,
        name: data.name,
        count: data.count,
      });
    }

    return indices.sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  /**
   * Check if a stock is in a specific index.
   *
   * @param ticker Stock symbol (e.g., "THYAO")
   * @param indexSymbol Index symbol (e.g., "XU030")
   * @returns True if stock is in the index
   */
  async isInIndex(ticker: string, indexSymbol: string): Promise<boolean> {
    const cleanTicker = ticker.toUpperCase();
    const cleanIndex = indexSymbol.toUpperCase();
    const rows = await this._downloadComponents();

    return rows.some(
      (row) => row.symbol === cleanTicker && row.index_code === cleanIndex,
    );
  }

  /**
   * Get all indices that contain a specific stock.
   *
   * @param ticker Stock symbol (e.g., "THYAO")
   * @returns List of index symbols that contain this stock
   */
  async getIndicesForTicker(ticker: string): Promise<string[]> {
    const cleanTicker = ticker.toUpperCase();
    const rows = await this._downloadComponents();

    const indexSet = new Set<string>();
    for (const row of rows) {
      if (row.symbol === cleanTicker) {
        indexSet.add(row.index_code);
      }
    }

    return Array.from(indexSet).sort();
  }
}

let _bistIndexProvider: BistIndexProvider | null = null;

export function getBistIndexProvider(): BistIndexProvider {
  if (!_bistIndexProvider) {
    _bistIndexProvider = new BistIndexProvider();
  }
  return _bistIndexProvider;
}
