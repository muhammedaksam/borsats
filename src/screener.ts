import { getBistIndexProvider } from "~/providers/bist-index";
import { getScreenerProvider } from "~/providers/isyatirim-screener";
import { ScreenerCriteria, ScreenerResult } from "~/types";

export class Screener {
  private _filters: Array<{
    criteria: string;
    min?: number;
    max?: number;
    required: boolean;
  }> = [];
  private _sector: string = "";
  private _index: string = "";
  private _recommendation: string = "";

  public static readonly CRITERIA_DEFAULTS: Record<
    string,
    { min: number; max: number }
  > = {
    price: { min: 0, max: 100000 },
    market_cap: { min: 0, max: 5000000 },
    market_cap_usd: { min: 0, max: 100000 },
    pe: { min: -1000, max: 10000 },
    pb: { min: -100, max: 1000 },
    ev_ebitda: { min: -100, max: 1000 },
    ev_sales: { min: -100, max: 1000 },
    dividend_yield: { min: 0, max: 100 },
    dividend_yield_2025: { min: 0, max: 100 },
    roe: { min: -200, max: 500 },
    roa: { min: -200, max: 500 },
    net_margin: { min: -200, max: 500 },
    ebitda_margin: { min: -200, max: 500 },
    upside_potential: { min: -100, max: 500 },
    foreign_ratio: { min: 0, max: 100 },
    float_ratio: { min: 0, max: 100 },
    return_1w: { min: -100, max: 100 },
    return_1m: { min: -100, max: 200 },
    return_1y: { min: -100, max: 1000 },
    return_ytd: { min: -100, max: 1000 },
    volume_3m: { min: 0, max: 1000 },
    volume_12m: { min: 0, max: 1000 },
    float_market_cap: { min: 0, max: 100000 },
  };

  /**
   * Available templates
   */
  public static readonly TEMPLATES = [
    "small_cap",
    "mid_cap",
    "large_cap",
    "high_dividend",
    "high_upside",
    "low_upside",
    "high_volume",
    "low_volume",
    "buy_recommendation",
    "sell_recommendation",
    "high_net_margin",
    "high_return",
    "low_pe",
    "high_roe",
    "high_foreign_ownership",
  ];

  constructor() {
    //
  }

  addFilter(
    criteria: string,
    min?: number,
    max?: number,
    required: boolean = false,
  ): Screener {
    this._filters.push({ criteria, min, max, required });
    return this;
  }

  setSector(sector: string): Screener {
    this._sector = sector;
    return this;
  }

  setIndex(index: string): Screener {
    this._index = index;
    return this;
  }

  setRecommendation(recommendation: string): Screener {
    this._recommendation = recommendation;
    return this;
  }

  clear(): Screener {
    this._filters = [];
    this._sector = "";
    this._index = "";
    this._recommendation = "";
    return this;
  }

  /**
   * Run the screen and return matching stocks.
   *
   * Note: İş Yatırım API doesn't support 'endeks' parameter - it returns empty
   * results for any non-empty value. So we filter locally using BIST index
   * components from bist_index provider.
   */
  async run(template?: string): Promise<ScreenerResult[]> {
    const provider = getScreenerProvider();
    const resolvedFilters: Array<[string, string, string, string]> = [];

    // Resolve filter IDs and apply defaults
    if (this._filters.length > 0) {
      const criteriaList = await provider.getCriteria();

      for (const f of this._filters) {
        const c = criteriaList.find(
          (item: ScreenerCriteria) =>
            item.name.toLowerCase() === f.criteria.toLowerCase() ||
            item.id === f.criteria,
        );

        const id = c ? c.id : f.criteria;
        const defaults =
          Screener.CRITERIA_DEFAULTS[f.criteria.toLowerCase()] ||
          Screener.CRITERIA_DEFAULTS["price"];

        let minVal = f.min;
        let maxVal = f.max;

        if (minVal === undefined && maxVal === undefined) {
          minVal = defaults?.min;
          maxVal = defaults?.max;
        } else {
          if (minVal === undefined) minVal = defaults?.min ?? -999999;
          if (maxVal === undefined) maxVal = defaults?.max ?? 999999;
        }

        resolvedFilters.push([
          id,
          minVal !== undefined ? String(minVal) : "",
          maxVal !== undefined ? String(maxVal) : "",
          f.required ? "True" : "False",
        ]);
      }
    }

    // Resolve sector ID
    let sectorId = this._sector;
    if (this._sector && !this._sector.startsWith("0")) {
      const sectorsList = await provider.getSectors();
      const match = sectorsList.find(
        (s) => s.name.toLowerCase() === this._sector.toLowerCase(),
      );
      if (match) sectorId = match.id;
    }

    // Note: Pass index=undefined to API since it doesn't support this filter
    const results = await provider.screen(
      resolvedFilters.length > 0 ? resolvedFilters : undefined,
      sectorId,
      "", // API doesn't support index, we filter locally
      this._recommendation,
      template,
    );

    // Filter by index locally if specified
    if (this._index && results.length > 0) {
      return this._filterByIndex(results, this._index);
    }

    return results;
  }

  /**
   * Filter results to only include symbols in the specified BIST index.
   *
   * Supported index formats:
   * - 'BIST 30', 'BIST30', 'XU030'
   * - 'BIST 50', 'BIST50', 'XU050'
   * - 'BIST 100', 'BIST100', 'XU100'
   * - 'XBANK', 'XUSIN', 'XUHIZ', 'XUTEK'
   */
  private async _filterByIndex(
    results: ScreenerResult[],
    index: string,
  ): Promise<ScreenerResult[]> {
    // Normalize index name to code (e.g., "BIST 30" -> "XU030")
    const indexMap: Record<string, string> = {
      "BIST 30": "XU030",
      BIST30: "XU030",
      "BIST 50": "XU050",
      BIST50: "XU050",
      "BIST 100": "XU100",
      BIST100: "XU100",
      "BIST BANKA": "XBANK",
      "BIST SINAİ": "XUSIN",
      "BIST HİZMETLER": "XUHIZ",
      "BIST TEKNOLOJİ": "XUTEK",
    };

    const normalizedIndex = index
      .toUpperCase()
      .replace(/_/g, " ")
      .replace(/-/g, " ");
    const indexCode = indexMap[normalizedIndex] || index.toUpperCase();

    try {
      const provider = getBistIndexProvider();
      const components = await provider.getComponents(indexCode);
      if (components && components.length > 0) {
        const symbols = components.map((c) => c.symbol);
        return results.filter((r) => symbols.includes(r.symbol));
      }
    } catch {
      // If index lookup fails, return unfiltered results
    }

    return results;
  }
}

export async function screenStocks(options: {
  template?: string;
  sector?: string;
  index?: string;
  recommendation?: string;
  market_cap_min?: number;
  market_cap_max?: number;
  pe_min?: number;
  pe_max?: number;
  pb_min?: number;
  pb_max?: number;
  dividend_yield_min?: number;
  dividend_yield_max?: number;
  upside_potential_min?: number;
  upside_potential_max?: number;
  net_margin_min?: number;
  net_margin_max?: number;
  roe_min?: number;
  roe_max?: number;
  [key: string]: unknown;
}): Promise<ScreenerResult[]> {
  const screener = new Screener();

  if (options.sector) screener.setSector(options.sector as string);
  if (options.index) screener.setIndex(options.index as string);
  if (options.recommendation)
    screener.setRecommendation(options.recommendation as string);

  if (
    options.market_cap_min !== undefined ||
    options.market_cap_max !== undefined
  ) {
    await screener.addFilter(
      "market_cap",
      options.market_cap_min as number,
      options.market_cap_max as number,
    );
  }

  if (options.pe_min !== undefined || options.pe_max !== undefined) {
    await screener.addFilter("pe", options.pe_min, options.pe_max);
  }

  if (options.pb_min !== undefined || options.pb_max !== undefined) {
    await screener.addFilter("pb", options.pb_min, options.pb_max);
  }

  if (
    options.dividend_yield_min !== undefined ||
    options.dividend_yield_max !== undefined
  ) {
    await screener.addFilter(
      "dividend_yield",
      options.dividend_yield_min,
      options.dividend_yield_max,
    );
  }

  if (
    options.upside_potential_min !== undefined ||
    options.upside_potential_max !== undefined
  ) {
    await screener.addFilter(
      "upside_potential",
      options.upside_potential_min,
      options.upside_potential_max,
    );
  }

  if (
    options.net_margin_min !== undefined ||
    options.net_margin_max !== undefined
  ) {
    await screener.addFilter(
      "net_margin",
      options.net_margin_min,
      options.net_margin_max,
    );
  }

  if (options.roe_min !== undefined || options.roe_max !== undefined) {
    await screener.addFilter("roe", options.roe_min, options.roe_max);
  }

  // Handle other keys matching CRITERIA_DEFAULTS suffixes like _min, _max
  for (const key of Object.keys(options)) {
    if (key.endsWith("_min")) {
      const criteria = key.replace("_min", "");
      if (Screener.CRITERIA_DEFAULTS[criteria]) {
        // already handled explicit ones?
        if (
          criteria === "market_cap" ||
          criteria === "pe" ||
          criteria === "pb" ||
          criteria === "dividend_yield" ||
          criteria === "upside_potential" ||
          criteria === "net_margin" ||
          criteria === "roe"
        )
          continue;
        await screener.addFilter(
          criteria,
          options[key] as number,
          options[criteria + "_max"] as number,
        );
      }
    }
  }

  return screener.run(options.template as string);
}

export function screenerCriteria() {
  return getScreenerProvider().getCriteria();
}

export function sectors() {
  return getScreenerProvider().getSectors();
}

export function stockIndices() {
  return getScreenerProvider().getIndices();
}
