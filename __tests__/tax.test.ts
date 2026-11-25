import { getTEFASProvider } from "~/providers/tefas";
import {
  classifyFundTaxCategory,
  getWithholdingTaxRate,
  TAX_CAT_DESCRIPTIONS,
  TAX_CAT_EQUITY_HEAVY,
  TAX_CAT_GSYF_GYF_LONG,
  TAX_CAT_GSYF_GYF_SHORT,
  TAX_CAT_OTHER,
  TAX_CAT_VARIABLE,
  TAX_CATEGORIES,
  TAX_PERIODS,
  withholdingTaxRate,
  withholdingTaxTable,
} from "~/tax";

jest.mock("~/providers/tefas");

describe("Tax Module (borsapy-aligned)", () => {
  describe("classifyFundTaxCategory - direct & disambiguated mappings", () => {
    test("Hisse Senedi Fonu (domestic) → pay_senedi_yogun", () => {
      expect(classifyFundTaxCategory("Hisse Senedi Fonu", "Ak Portföy BIST 30")).toBe(
        TAX_CAT_EQUITY_HEAVY,
      );
      expect(classifyFundTaxCategory("Hisse Senedi Yoğun Fon")).toBe(
        TAX_CAT_EQUITY_HEAVY,
      );
      expect(classifyFundTaxCategory("Hisse Senedi Şemsiye Fonu")).toBe(
        TAX_CAT_EQUITY_HEAVY,
      );
    });

    test("Hisse Senedi Fonu (foreign / yabancı) → degisken_karma_doviz", () => {
      expect(
        classifyFundTaxCategory("Hisse Senedi Fonu", "Yapı Kredi Yabancı Teknoloji Fonu"),
      ).toBe(TAX_CAT_VARIABLE);
      expect(
        classifyFundTaxCategory("Hisse Senedi Şemsiye Fonu", "Yabanci Hisse Fonu"),
      ).toBe(TAX_CAT_VARIABLE);
    });

    test("Variable categories → degisken_karma_doviz", () => {
      for (const cat of [
        "Değişken Fon",
        "Karma Fon",
        "Serbest Fon",
        "Fon Sepeti Fonu",
        "Yabancı Fon Sepeti Fonu",
        "Değişken Şemsiye Fonu",
        "Dış Borçlanma Araçları Fonu",
        "Eurobond",
      ]) {
        expect(classifyFundTaxCategory(cat)).toBe(TAX_CAT_VARIABLE);
      }
    });

    test("Bond / money market / precious metal / participation → borclanma_para_maden", () => {
      for (const cat of [
        "Borçlanma Araçları Fonu",
        "Para Piyasası Fonu",
        "Kıymetli Madenler Fonu",
        "Katılım Fonu",
        "Altın Fonu",
        "Borçlanma Araçları Şemsiye Fonu",
        "OKS Standart Fon",
        "Oks Katılım Standart Fon",
        "Kısa Vadeli Borçlanma Araçları",
      ]) {
        expect(classifyFundTaxCategory(cat)).toBe(TAX_CAT_OTHER);
      }
    });

    test("GSYF / GYF → gsyf_gyf_kisa (conservative short-term default)", () => {
      expect(classifyFundTaxCategory("Gayrimenkul Yatırım Fonları")).toBe(
        TAX_CAT_GSYF_GYF_SHORT,
      );
      expect(classifyFundTaxCategory("Girişim Sermayesi Yatırım Fonları")).toBe(
        TAX_CAT_GSYF_GYF_SHORT,
      );
      expect(classifyFundTaxCategory("Gayrimenkul Yatırım Fonu")).toBe(
        TAX_CAT_GSYF_GYF_SHORT,
      );
      expect(classifyFundTaxCategory("Girişim Sermayesi Yatırım Fonu")).toBe(
        TAX_CAT_GSYF_GYF_SHORT,
      );
    });

    test("Fallback: döviz in fund name → degisken_karma_doviz", () => {
      expect(classifyFundTaxCategory("Özel Kategori", "Ak Portföy Döviz Fonu")).toBe(
        TAX_CAT_VARIABLE,
      );
    });

    test("Empty or unknown category returns null", () => {
      expect(classifyFundTaxCategory("")).toBeNull();
      expect(classifyFundTaxCategory("Unknown Category", "Unknown Fund")).toBeNull();
    });
  });

  describe("getWithholdingTaxRate - 6 Turkish stopaj periods", () => {
    test("Equity-heavy is always 0.0 across all periods", () => {
      for (const dt of [
        "2020-01-01",
        "2023-06-01",
        "2024-06-01",
        "2024-12-01",
        "2025-06-01",
        "2025-08-01",
      ]) {
        expect(getWithholdingTaxRate(TAX_CATEGORIES.EQUITY_HEAVY, dt)).toBe(0);
      }
    });

    test("Variable / Karma / Döviz schedule", () => {
      expect(getWithholdingTaxRate(TAX_CAT_VARIABLE, "2020-12-22")).toBe(0.1);
      expect(getWithholdingTaxRate(TAX_CAT_VARIABLE, "2020-12-23")).toBe(0.1);
      expect(getWithholdingTaxRate(TAX_CAT_VARIABLE, "2024-05-01")).toBe(0.1);
      expect(getWithholdingTaxRate(TAX_CAT_VARIABLE, "2024-11-01")).toBe(0.1);
      expect(getWithholdingTaxRate(TAX_CAT_VARIABLE, "2025-02-01")).toBe(0.15);
      expect(getWithholdingTaxRate(TAX_CAT_VARIABLE, "2025-07-08")).toBe(0.15);
      expect(getWithholdingTaxRate(TAX_CAT_VARIABLE, "2025-07-09")).toBe(0.175);
      expect(getWithholdingTaxRate(TAX_CAT_VARIABLE, new Date("2026-01-15"))).toBe(0.175);
    });

    test("Other (Money Market / Bond / Precious Metals / Participation) schedule", () => {
      expect(getWithholdingTaxRate(TAX_CAT_OTHER, "2020-12-22")).toBe(0.1);
      expect(getWithholdingTaxRate(TAX_CAT_OTHER, "2021-06-01")).toBe(0.0);
      expect(getWithholdingTaxRate(TAX_CAT_OTHER, "2024-04-30")).toBe(0.0);
      expect(getWithholdingTaxRate(TAX_CAT_OTHER, "2024-05-01")).toBe(0.075);
      expect(getWithholdingTaxRate(TAX_CAT_OTHER, "2024-10-31")).toBe(0.075);
      expect(getWithholdingTaxRate(TAX_CAT_OTHER, "2024-11-01")).toBe(0.1);
      expect(getWithholdingTaxRate(TAX_CAT_OTHER, "2025-01-31")).toBe(0.1);
      expect(getWithholdingTaxRate(TAX_CAT_OTHER, "2025-02-01")).toBe(0.15);
      expect(getWithholdingTaxRate(TAX_CAT_OTHER, "2025-07-08")).toBe(0.15);
      expect(getWithholdingTaxRate(TAX_CAT_OTHER, "2025-07-09")).toBe(0.175);
    });

    test("GSYF/GYF > 730 days holding overrides to 0.0", () => {
      expect(getWithholdingTaxRate(TAX_CAT_GSYF_GYF_SHORT, "2025-08-01", 365)).toBe(0.175);
      expect(getWithholdingTaxRate(TAX_CAT_GSYF_GYF_SHORT, "2025-08-01", 730)).toBe(0.175);
      expect(getWithholdingTaxRate(TAX_CAT_GSYF_GYF_SHORT, "2025-08-01", 731)).toBe(0.0);
      expect(getWithholdingTaxRate(TAX_CAT_GSYF_GYF_LONG, "2025-08-01")).toBe(0.0);
    });

    test("Throws on unknown tax category or invalid date", () => {
      expect(() => getWithholdingTaxRate("unknown_cat", "2025-08-01")).toThrow(
        "Unknown tax category",
      );
      expect(() => getWithholdingTaxRate(TAX_CAT_OTHER, "not-a-date")).toThrow();
    });

    test("Defaults purchaseDate to today (latest period >= 09.07.2025)", () => {
      expect(getWithholdingTaxRate(TAX_CAT_OTHER)).toBe(0.175);
    });
  });

  describe("withholdingTaxRate (async)", () => {
    test("Domestic equity fund → 0", async () => {
      (getTEFASProvider as jest.Mock).mockReturnValue({
        getFundDetail: jest.fn().mockResolvedValue({
          category: "Hisse Senedi Fonu",
          name: "Test BIST Hisse Fonu",
        }),
      });

      const rate = await withholdingTaxRate("TEST", "2025-08-01");
      expect(rate).toBe(0);
    });

    test("Gold fund respects purchase date", async () => {
      (getTEFASProvider as jest.Mock).mockReturnValue({
        getFundDetail: jest.fn().mockResolvedValue({
          category: "Altın Fonu",
          name: "Altın Fon",
        }),
      });

      expect(await withholdingTaxRate("GOLD", "2022-10-01")).toBe(0);
      expect(await withholdingTaxRate("GOLD", "2024-06-01")).toBe(0.075);
      expect(await withholdingTaxRate("GOLD", "2025-06-01")).toBe(0.15);
      expect(await withholdingTaxRate("GOLD", "2025-08-01")).toBe(0.175);
    });

    test("Unrecognized or missing category returns null", async () => {
      (getTEFASProvider as jest.Mock).mockReturnValue({
        getFundDetail: jest.fn().mockResolvedValue({
          category: "",
          name: "",
        }),
      });

      expect(await withholdingTaxRate("UNK")).toBeNull();
    });
  });

  describe("withholdingTaxTable", () => {
    test("returns all 5 categories across 6 periods", () => {
      const table = withholdingTaxTable();
      expect(table.length).toBe(5);
      expect(TAX_PERIODS.length).toBe(6);

      for (const entry of table) {
        expect(entry.tax_category).toBeDefined();
        expect(entry.description).toBe(TAX_CAT_DESCRIPTIONS[entry.tax_category]);
        expect(entry.periods.length).toBe(TAX_PERIODS.length);
        for (const p of entry.periods) {
          expect(typeof p.label).toBe("string");
          expect(typeof p.rate).toBe("number");
        }
      }
    });
  });
});
