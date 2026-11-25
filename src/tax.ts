/**
 * Withholding tax (stopaj) rates for Turkish investment funds.
 *
 * Static reference table based on Gelir Vergisi Kanunu geçici 67. madde.
 * Tax rates depend on fund category, purchase date, and optionally holding duration.
 *
 * Aligned with borsapy's `tax.py` (Ziraat Bank withholding tax table + TEFAS category mapping).
 */

import { getTEFASProvider } from "~/providers/tefas";

// ---------------------------------------------------------------------------
// Tax category identifiers
// ---------------------------------------------------------------------------

export const TAX_CAT_VARIABLE = "degisken_karma_doviz" as const;
export const TAX_CAT_EQUITY_HEAVY = "pay_senedi_yogun" as const;
export const TAX_CAT_OTHER = "borclanma_para_maden" as const;
export const TAX_CAT_GSYF_GYF_LONG = "gsyf_gyf_uzun" as const;
export const TAX_CAT_GSYF_GYF_SHORT = "gsyf_gyf_kisa" as const;

export const TAX_CATEGORIES = {
  VARIABLE: TAX_CAT_VARIABLE,
  EQUITY_HEAVY: TAX_CAT_EQUITY_HEAVY,
  OTHER: TAX_CAT_OTHER,
  GSYF_GYF_LONG: TAX_CAT_GSYF_GYF_LONG,
  GSYF_GYF_SHORT: TAX_CAT_GSYF_GYF_SHORT,
} as const;

export type TaxCategory = (typeof TAX_CATEGORIES)[keyof typeof TAX_CATEGORIES];

export const TAX_CAT_DESCRIPTIONS: Record<TaxCategory, string> = {
  [TAX_CAT_VARIABLE]:
    "Degisken, karma, eurobond, dis borclanma, yabanci, serbest + doviz",
  [TAX_CAT_EQUITY_HEAVY]: "Pay senedi yogun fon",
  [TAX_CAT_OTHER]: "Borclanma araclari, para piyasasi, kiymetli maden, katilim",
  [TAX_CAT_GSYF_GYF_LONG]: "GSYF/GYF (>2 yil)",
  [TAX_CAT_GSYF_GYF_SHORT]: "GSYF/GYF (<2 yil)",
};

// ---------------------------------------------------------------------------
// Date periods (start inclusive, end inclusive; null means open-ended)
// ---------------------------------------------------------------------------

export interface TaxPeriod {
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null; // YYYY-MM-DD
  label: string;
}

export const TAX_PERIODS: TaxPeriod[] = [
  {
    startDate: null,
    endDate: "2020-12-22",
    label: "<23.12.2020",
  },
  {
    startDate: "2020-12-23",
    endDate: "2024-04-30",
    label: "23.12.2020-30.04.2024",
  },
  {
    startDate: "2024-05-01",
    endDate: "2024-10-31",
    label: "01.05.2024-31.10.2024",
  },
  {
    startDate: "2024-11-01",
    endDate: "2025-01-31",
    label: "01.11.2024-31.01.2025",
  },
  {
    startDate: "2025-02-01",
    endDate: "2025-07-08",
    label: "01.02.2025-08.07.2025",
  },
  {
    startDate: "2025-07-09",
    endDate: null,
    label: ">=09.07.2025",
  },
];

// ---------------------------------------------------------------------------
// Rate table: tax_category -> list of rates (one per period, as percentages)
// ---------------------------------------------------------------------------

export const TAX_RATES: Record<TaxCategory, number[]> = {
  [TAX_CAT_VARIABLE]: [10.0, 10.0, 10.0, 10.0, 15.0, 17.5],
  [TAX_CAT_EQUITY_HEAVY]: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  [TAX_CAT_OTHER]: [10.0, 0.0, 7.5, 10.0, 15.0, 17.5],
  [TAX_CAT_GSYF_GYF_LONG]: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  [TAX_CAT_GSYF_GYF_SHORT]: [10.0, 0.0, 7.5, 10.0, 15.0, 17.5],
};

// ---------------------------------------------------------------------------
// TEFAS category -> tax category mapping
// ---------------------------------------------------------------------------

const TEFAS_CATEGORY_MAP: Record<string, TaxCategory> = {
  // --- TAX_CAT_VARIABLE ---
  // FONKATEGORI values
  "Değişken Fon": TAX_CAT_VARIABLE,
  "Karma Fon": TAX_CAT_VARIABLE,
  "Serbest Fon": TAX_CAT_VARIABLE,
  "Fon Sepeti Fonu": TAX_CAT_VARIABLE,
  "Yabancı Fon Sepeti Fonu": TAX_CAT_VARIABLE,
  // FONTURACIKLAMA (Şemsiye) values
  "Değişken Şemsiye Fonu": TAX_CAT_VARIABLE,
  "Karma Şemsiye Fonu": TAX_CAT_VARIABLE,
  "Serbest Şemsiye Fonu": TAX_CAT_VARIABLE,
  "Fon Sepeti Şemsiye Fonu": TAX_CAT_VARIABLE,
  // EMK-specific FONTURACIKLAMA values
  "Dış Borçlanma Araçları Fonu": TAX_CAT_VARIABLE,
  "Katılım Değişken Fon": TAX_CAT_VARIABLE,
  "Yaşam Döngüsü/Hedef Fon": TAX_CAT_VARIABLE,
  // Short-form legacy values
  Değişken: TAX_CAT_VARIABLE,
  Karma: TAX_CAT_VARIABLE,
  Serbest: TAX_CAT_VARIABLE,
  Eurobond: TAX_CAT_VARIABLE,
  "Yabancı Hisse Senedi": TAX_CAT_VARIABLE,
  "Yabancı Borçlanma Araçları": TAX_CAT_VARIABLE,
  "Dış Borçlanma Araçları": TAX_CAT_VARIABLE,
  "Fon Sepeti": TAX_CAT_VARIABLE,
  // --- TAX_CAT_OTHER ---
  // FONKATEGORI values
  "Borçlanma Araçları Fonu": TAX_CAT_OTHER,
  "Para Piyasası Fonu": TAX_CAT_OTHER,
  "Kıymetli Madenler Fonu": TAX_CAT_OTHER,
  "Katılım Fonu": TAX_CAT_OTHER,
  // FONTURACIKLAMA (Şemsiye) values
  "Borçlanma Araçları Şemsiye Fonu": TAX_CAT_OTHER,
  "Para Piyasası Şemsiye Fonu": TAX_CAT_OTHER,
  "Kıymetli Madenler Şemsiye Fonu": TAX_CAT_OTHER,
  "Katılım Şemsiye Fonu": TAX_CAT_OTHER,
  // EMK-specific FONTURACIKLAMA values
  "Kamu Borçlanma Araçları Fonu": TAX_CAT_OTHER,
  "Kamu Yabancı Para (Döviz) Cinsinden Borçlanma Araç": TAX_CAT_OTHER,
  "Özel Sektör Borçlanma Araçları Fonu": TAX_CAT_OTHER,
  "Endeks Fon": TAX_CAT_OTHER,
  "Standart Fon": TAX_CAT_OTHER,
  "OKS Standart Fon": TAX_CAT_OTHER,
  "OKS Katılım Standart Fon": TAX_CAT_OTHER,
  "Katılım Standart Fon": TAX_CAT_OTHER,
  "Kira Sertifikası Fonu": TAX_CAT_OTHER,
  "Kira Sertifikasi Katılım Fonu": TAX_CAT_OTHER,
  "Altın Fonu": TAX_CAT_OTHER,
  "Altın Katılım Fonu": TAX_CAT_OTHER,
  "Merkezi Alacağın Devri Fonu": TAX_CAT_OTHER,
  "Kıymetli Madenler": TAX_CAT_OTHER,
  "Katılım Katkı Fonu": TAX_CAT_OTHER,
  // FONKATEGORI alternate casing (EMK uses "Oks" instead of "OKS")
  "Oks Standart Fon": TAX_CAT_OTHER,
  "Oks Katılım Standart Fon": TAX_CAT_OTHER,
  // Short-form legacy values
  "Kısa Vadeli Borçlanma Araçları": TAX_CAT_OTHER,
  "Kısa Vadeli Borçlanma": TAX_CAT_OTHER,
  "Uzun Vadeli Borçlanma Araçları": TAX_CAT_OTHER,
  "Borçlanma Araçları": TAX_CAT_OTHER,
  "Para Piyasası": TAX_CAT_OTHER,
  "Kıymetli Maden": TAX_CAT_OTHER,
  Katılım: TAX_CAT_OTHER,
  // --- TAX_CAT_GSYF_GYF (conservative default: short-term rate) ---
  "Girişim Sermayesi Yatırım Fonları": TAX_CAT_GSYF_GYF_SHORT,
  "Gayrimenkul Yatırım Fonları": TAX_CAT_GSYF_GYF_SHORT,
  "Girişim Sermayesi Yatırım Fonu": TAX_CAT_GSYF_GYF_SHORT,
  "Gayrimenkul Yatırım Fonu": TAX_CAT_GSYF_GYF_SHORT,
  "Girişim Sermayesi": TAX_CAT_GSYF_GYF_SHORT,
  Gayrimenkul: TAX_CAT_GSYF_GYF_SHORT,
};

// Categories that need name-based disambiguation (domestic vs foreign equity)
const HISSE_CATEGORIES = new Set([
  "Hisse Senedi Fonu",
  "Hisse Senedi Şemsiye Fonu",
  "Hisse Senedi",
  "Hisse Senedi Yoğun",
  "Hisse Senedi Yoğun Fon",
]);

const FOREIGN_EQUITY_KEYWORDS = ["yabancı", "yabanci"];

function toIsoDateString(value: Date | string): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const parsed = new Date(`${trimmed}T00:00:00.000Z`);
      if (isNaN(parsed.getTime())) {
        throw new Error(`Invalid date string: ${value}`);
      }
      return trimmed;
    }
    const parsed = new Date(trimmed);
    if (isNaN(parsed.getTime())) {
      throw new Error(`Invalid date string: ${value}`);
    }
    return parsed.toISOString().slice(0, 10);
  }
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  throw new Error(`Invalid purchaseDate: ${String(value)}`);
}

function findPeriodIndex(purchaseDateIso: string): number {
  for (let i = 0; i < TAX_PERIODS.length; i++) {
    const { startDate, endDate } = TAX_PERIODS[i];
    if (startDate !== null && purchaseDateIso < startDate) continue;
    if (endDate !== null && purchaseDateIso > endDate) continue;
    return i;
  }
  return TAX_PERIODS.length - 1;
}

/**
 * Classify a fund into a tax category based on its TEFAS category and name.
 *
 * @param category - TEFAS fund category string (e.g., "Değişken Fon", "Hisse Senedi Fonu")
 * @param fundName - Optional fund full name for foreign-equity and "döviz" disambiguation
 * @returns Tax category identifier string, or null if unrecognized
 */
export function classifyFundTaxCategory(
  category: string,
  fundName: string = "",
): TaxCategory | null {
  if (!category) return null;

  const cat = category.trim();
  const nameLower = fundName ? fundName.toLocaleLowerCase("tr-TR") : "";

  // Hisse Senedi category needs name-based disambiguation
  if (HISSE_CATEGORIES.has(cat)) {
    if (FOREIGN_EQUITY_KEYWORDS.some((kw) => nameLower.includes(kw))) {
      return TAX_CAT_VARIABLE;
    }
    return TAX_CAT_EQUITY_HEAVY;
  }

  // Direct mapping
  if (cat in TEFAS_CATEGORY_MAP) {
    return TEFAS_CATEGORY_MAP[cat];
  }

  // Fallback: "döviz" in fund name -> variable
  if (nameLower.includes("döviz") || nameLower.includes("doviz")) {
    return TAX_CAT_VARIABLE;
  }

  return null;
}

/**
 * Get the withholding tax rate for a given tax category and purchase date.
 *
 * @param taxCategory - Tax category identifier (e.g., `TAX_CAT_VARIABLE`)
 * @param purchaseDate - Purchase date (`Date` or `"YYYY-MM-DD"` string). Defaults to today.
 * @param holdingDays - Number of days held. For GSYF/GYF funds, >730 days qualifies for 0%.
 * @returns Tax rate as a decimal (e.g., `0.15` for 15%, `0.175` for 17.5%)
 */
export function getWithholdingTaxRate(
  taxCategory: string,
  purchaseDate: Date | string = new Date(),
  holdingDays?: number,
): number {
  if (!(taxCategory in TAX_RATES)) {
    throw new Error(`Unknown tax category: ${taxCategory}`);
  }

  let effectiveCategory = taxCategory as TaxCategory;

  // GSYF/GYF holding duration override (> 2 years = > 730 days -> 0%)
  if (
    effectiveCategory === TAX_CAT_GSYF_GYF_SHORT &&
    holdingDays !== undefined &&
    holdingDays > 730
  ) {
    effectiveCategory = TAX_CAT_GSYF_GYF_LONG;
  }

  const isoDate = toIsoDateString(purchaseDate);
  const periodIdx = findPeriodIndex(isoDate);
  const ratePct = TAX_RATES[effectiveCategory][periodIdx];
  return ratePct / 100.0;
}

/**
 * Convenience function: get withholding tax rate for a specific TEFAS fund code.
 *
 * @param fundCode - TEFAS fund code (e.g., "AAK", "TTE")
 * @param purchaseDate - Purchase date (`Date` or `"YYYY-MM-DD"` string). Defaults to today.
 * @param holdingDays - Number of days held (relevant for GSYF/GYF funds)
 * @returns Tax rate as a decimal (e.g., `0.175` for 17.5%), or `null` if category cannot be determined
 */
export async function withholdingTaxRate(
  fundCode: string,
  purchaseDate?: Date | string,
  holdingDays?: number,
): Promise<number | null> {
  const detail = await getTEFASProvider().getFundDetail(fundCode);
  const category = detail.category || "";
  const taxCategory = classifyFundTaxCategory(category, detail.name || "");
  if (taxCategory === null) return null;
  return getWithholdingTaxRate(
    taxCategory,
    purchaseDate ?? new Date(),
    holdingDays,
  );
}

/**
 * Get the full withholding tax reference table (rates in percentages).
 */
export function withholdingTaxTable(): Array<{
  tax_category: TaxCategory;
  description: string;
  periods: Array<{ label: string; rate: number }>;
}> {
  const orderedCategories: TaxCategory[] = [
    TAX_CAT_VARIABLE,
    TAX_CAT_EQUITY_HEAVY,
    TAX_CAT_OTHER,
    TAX_CAT_GSYF_GYF_LONG,
    TAX_CAT_GSYF_GYF_SHORT,
  ];

  return orderedCategories.map((cat) => ({
    tax_category: cat,
    description: TAX_CAT_DESCRIPTIONS[cat],
    periods: TAX_PERIODS.map((period, i) => ({
      label: period.label,
      rate: TAX_RATES[cat][i],
    })),
  }));
}
