/**
 * Withholding tax (stopaj) rates for Turkish investment funds.
 *
 * Tax categories and rates as defined by Turkish tax law.
 * Rates are based on purchase date and holding period.
 *
 * Reference: GİB (Gelir İdaresi Başkanlığı) regulations
 */

import { getTEFASProvider } from "~/providers/tefas";

// Tax categories
export const TAX_CATEGORIES = {
  HISSE_YOĞUN: "Hisse Yoğun Fon",
  HISSE_ENDEKS: "Hisse Endeks Fon",
  DIGER: "Diğer Fon",
  GIRISIM_SERMAYESI: "Girişim Sermayesi Fon",
  GAYRIMENKUL: "Gayrimenkul Yatırım Fon",
  ALTIN_GUMUS: "Altın/Gümüş ve Kıymetli Maden Fonları",
  DOVIZ: "Döviz Fonları",
  KATILIM: "Katılım Fonları (Faiz Dışı)",
  BYF_HISSE: "BYF Hisse",
  BYF_DIGER: "BYF Diğer",
} as const;

export type TaxCategory = (typeof TAX_CATEGORIES)[keyof typeof TAX_CATEGORIES];

// Tax period thresholds
export interface TaxPeriod {
  startDate: Date;
  endDate: Date | null; // null = still in effect
  label: string;
}

export const TAX_PERIODS: TaxPeriod[] = [
  {
    startDate: new Date("2022-07-25"),
    endDate: new Date("2022-11-25"),
    label: "25.07.2022 – 25.11.2022",
  },
  {
    startDate: new Date("2022-11-26"),
    endDate: new Date("2023-05-31"),
    label: "26.11.2022 – 31.05.2023",
  },
  {
    startDate: new Date("2023-06-01"),
    endDate: null,
    label: "01.06.2023 – Güncel",
  },
];

// Tax rates by category and period
// Each entry: [category, periodIndex, rate]
const TAX_RATES: Record<string, number[]> = {
  [TAX_CATEGORIES.HISSE_YOĞUN]: [0, 0, 0],
  [TAX_CATEGORIES.HISSE_ENDEKS]: [0, 0, 0],
  [TAX_CATEGORIES.DIGER]: [10, 10, 10],
  [TAX_CATEGORIES.GIRISIM_SERMAYESI]: [0, 0, 0],
  [TAX_CATEGORIES.GAYRIMENKUL]: [0, 0, 0],
  [TAX_CATEGORIES.ALTIN_GUMUS]: [0, 0, 10],
  [TAX_CATEGORIES.DOVIZ]: [0, 0, 10],
  [TAX_CATEGORIES.KATILIM]: [0, 0, 10],
  [TAX_CATEGORIES.BYF_HISSE]: [0, 0, 0],
  [TAX_CATEGORIES.BYF_DIGER]: [10, 10, 10],
};

/**
 * TEFAS category → tax category mapping
 */
const TEFAS_CATEGORY_TAX_MAP: Record<string, string> = {
  // Hisse Yoğun
  "Hisse Senedi Fonu": TAX_CATEGORIES.HISSE_YOĞUN,
  "Hisse Senedi Yoğun Fon": TAX_CATEGORIES.HISSE_YOĞUN,
  "Esnek Fon": TAX_CATEGORIES.DIGER,
  "Dengeli Fon": TAX_CATEGORIES.DIGER,
  // Para Piyasası / Borçlanma
  "Para Piyasası Fonu": TAX_CATEGORIES.DIGER,
  "Kısa Vadeli Borçlanma Araçları Fonu": TAX_CATEGORIES.DIGER,
  "Uzun Vadeli Borçlanma Araçları Fonu": TAX_CATEGORIES.DIGER,
  "Borçlanma Araçları Fonu": TAX_CATEGORIES.DIGER,
  // Kıymetli Maden
  "Altın Fonu": TAX_CATEGORIES.ALTIN_GUMUS,
  "Kıymetli Madenler Fonu": TAX_CATEGORIES.ALTIN_GUMUS,
  // Katılım
  "Katılım Fonu": TAX_CATEGORIES.KATILIM,
  // BYF (Borsa Yatırım Fonu)
  "Borsa Yatırım Fonu": TAX_CATEGORIES.BYF_DIGER,
  // Gayrimenkul
  "Gayrimenkul Yatırım Fonu": TAX_CATEGORIES.GAYRIMENKUL,
  // Girişim Sermayesi
  "Girişim Sermayesi Yatırım Fonu": TAX_CATEGORIES.GIRISIM_SERMAYESI,
  // Fon Sepeti
  "Fon Sepeti Fonu": TAX_CATEGORIES.DIGER,
  // Serbest
  "Serbest Fon": TAX_CATEGORIES.DIGER,
};

/**
 * Classify a fund's TEFAS category into a tax category.
 *
 * @param category - TEFAS category string
 * @param fundName - Optional fund name for additional heuristics
 * @returns Tax category string
 */
export function classifyFundTaxCategory(
  category: string,
  fundName?: string,
): string {
  // Direct mapping
  const mapped = TEFAS_CATEGORY_TAX_MAP[category];
  if (mapped) return mapped;

  // Fuzzy match on category
  const lower = category.toLowerCase();
  if (lower.includes("hisse") && lower.includes("endeks")) {
    return TAX_CATEGORIES.HISSE_ENDEKS;
  }
  if (lower.includes("hisse")) {
    return TAX_CATEGORIES.HISSE_YOĞUN;
  }
  if (
    lower.includes("altın") ||
    lower.includes("gümüş") ||
    lower.includes("kıymetli maden")
  ) {
    return TAX_CATEGORIES.ALTIN_GUMUS;
  }
  if (lower.includes("döviz")) {
    return TAX_CATEGORIES.DOVIZ;
  }
  if (lower.includes("katılım")) {
    return TAX_CATEGORIES.KATILIM;
  }
  if (lower.includes("gayrimenkul")) {
    return TAX_CATEGORIES.GAYRIMENKUL;
  }
  if (lower.includes("girişim")) {
    return TAX_CATEGORIES.GIRISIM_SERMAYESI;
  }

  // Fund name heuristics
  if (fundName) {
    const nameLower = fundName.toLowerCase();
    if (nameLower.includes("hisse") && nameLower.includes("endeks")) {
      return TAX_CATEGORIES.HISSE_ENDEKS;
    }
    if (nameLower.includes("hisse")) {
      return TAX_CATEGORIES.HISSE_YOĞUN;
    }
    if (nameLower.includes("altın") || nameLower.includes("kıymetli maden")) {
      return TAX_CATEGORIES.ALTIN_GUMUS;
    }
  }

  // Default to "Diğer"
  return TAX_CATEGORIES.DIGER;
}

/**
 * Get the withholding tax rate for a given tax category and purchase date.
 *
 * @param taxCategory - Tax category (from classifyFundTaxCategory)
 * @param purchaseDate - Date when the fund was purchased
 * @param _holdingDays - Number of days held (reserved for future use)
 * @returns Tax rate as percentage (e.g., 10 means 10%)
 */
export function getWithholdingTaxRate(
  taxCategory: string,
  purchaseDate?: Date,
  _holdingDays?: number,
): number {
  const rates = TAX_RATES[taxCategory];
  if (!rates) return 10; // Default rate if category unknown

  if (!purchaseDate) {
    // Return current (latest period) rate
    return rates[rates.length - 1];
  }

  // Find applicable period
  for (let i = 0; i < TAX_PERIODS.length; i++) {
    const period = TAX_PERIODS[i];
    const inRange =
      purchaseDate >= period.startDate &&
      (period.endDate === null || purchaseDate <= period.endDate);
    if (inRange) {
      return rates[i];
    }
  }

  // Before first period or after last — use most recent
  return rates[rates.length - 1];
}

/**
 * Convenience function: get withholding tax rate for a fund code.
 * Fetches the fund's category from TEFAS and looks up the tax rate.
 *
 * @param fundCode - TEFAS fund code
 * @param purchaseDate - Date when the fund was purchased
 * @param holdingDays - Number of days held (reserved for future use)
 * @returns Tax rate as percentage
 */
export async function withholdingTaxRate(
  fundCode: string,
  purchaseDate?: Date,
  holdingDays?: number,
): Promise<number> {
  const detail = await getTEFASProvider().getFundDetail(fundCode);
  const category = detail.category || "";
  const taxCategory = classifyFundTaxCategory(category, detail.name);
  return getWithholdingTaxRate(taxCategory, purchaseDate, holdingDays);
}

/**
 * Get the full withholding tax rate table as an array of objects.
 * Useful for display or reference.
 */
export function withholdingTaxTable(): Array<{
  category: string;
  periods: Array<{ label: string; rate: number }>;
}> {
  return Object.entries(TAX_RATES).map(([category, rates]) => ({
    category,
    periods: TAX_PERIODS.map((period, i) => ({
      label: period.label,
      rate: rates[i],
    })),
  }));
}
