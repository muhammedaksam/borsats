import { getTEFASProvider } from "~/providers/tefas";
import {
  TAX_CATEGORIES,
  TAX_PERIODS,
  classifyFundTaxCategory,
  getWithholdingTaxRate,
  withholdingTaxRate,
  withholdingTaxTable,
} from "~/tax";

jest.mock("~/providers/tefas");

describe("Tax Module", () => {
  describe("classifyFundTaxCategory - direct mappings", () => {
    test("Hisse Senedi Fonu → HISSE_YOĞUN", () => {
      expect(classifyFundTaxCategory("Hisse Senedi Fonu")).toBe(
        TAX_CATEGORIES.HISSE_YOĞUN,
      );
    });

    test("Hisse Senedi Yoğun Fon → HISSE_YOĞUN", () => {
      expect(classifyFundTaxCategory("Hisse Senedi Yoğun Fon")).toBe(
        TAX_CATEGORIES.HISSE_YOĞUN,
      );
    });

    test("Esnek Fon → DIGER", () => {
      expect(classifyFundTaxCategory("Esnek Fon")).toBe(TAX_CATEGORIES.DIGER);
    });

    test("Dengeli Fon → DIGER", () => {
      expect(classifyFundTaxCategory("Dengeli Fon")).toBe(TAX_CATEGORIES.DIGER);
    });

    test("Para Piyasası Fonu → DIGER", () => {
      expect(classifyFundTaxCategory("Para Piyasası Fonu")).toBe(
        TAX_CATEGORIES.DIGER,
      );
    });

    test("Kısa Vadeli Borçlanma Araçları Fonu → DIGER", () => {
      expect(
        classifyFundTaxCategory("Kısa Vadeli Borçlanma Araçları Fonu"),
      ).toBe(TAX_CATEGORIES.DIGER);
    });

    test("Altın Fonu → ALTIN_GUMUS", () => {
      expect(classifyFundTaxCategory("Altın Fonu")).toBe(
        TAX_CATEGORIES.ALTIN_GUMUS,
      );
    });

    test("Kıymetli Madenler Fonu → ALTIN_GUMUS", () => {
      expect(classifyFundTaxCategory("Kıymetli Madenler Fonu")).toBe(
        TAX_CATEGORIES.ALTIN_GUMUS,
      );
    });

    test("Katılım Fonu → KATILIM", () => {
      expect(classifyFundTaxCategory("Katılım Fonu")).toBe(
        TAX_CATEGORIES.KATILIM,
      );
    });

    test("Borsa Yatırım Fonu → BYF_DIGER", () => {
      expect(classifyFundTaxCategory("Borsa Yatırım Fonu")).toBe(
        TAX_CATEGORIES.BYF_DIGER,
      );
    });

    test("Gayrimenkul Yatırım Fonu → GAYRIMENKUL", () => {
      expect(classifyFundTaxCategory("Gayrimenkul Yatırım Fonu")).toBe(
        TAX_CATEGORIES.GAYRIMENKUL,
      );
    });

    test("Girişim Sermayesi Yatırım Fonu → GIRISIM_SERMAYESI", () => {
      expect(classifyFundTaxCategory("Girişim Sermayesi Yatırım Fonu")).toBe(
        TAX_CATEGORIES.GIRISIM_SERMAYESI,
      );
    });

    test("Fon Sepeti Fonu → DIGER", () => {
      expect(classifyFundTaxCategory("Fon Sepeti Fonu")).toBe(
        TAX_CATEGORIES.DIGER,
      );
    });

    test("Serbest Fon → DIGER", () => {
      expect(classifyFundTaxCategory("Serbest Fon")).toBe(
        TAX_CATEGORIES.DIGER,
      );
    });

    test("Uzun Vadeli Borçlanma Araçları Fonu → DIGER", () => {
      expect(
        classifyFundTaxCategory("Uzun Vadeli Borçlanma Araçları Fonu"),
      ).toBe(TAX_CATEGORIES.DIGER);
    });

    test("Borçlanma Araçları Fonu → DIGER", () => {
      expect(classifyFundTaxCategory("Borçlanma Araçları Fonu")).toBe(
        TAX_CATEGORIES.DIGER,
      );
    });
  });

  describe("classifyFundTaxCategory - fuzzy category matching", () => {
    test("hisse endeks fuzzy → HISSE_ENDEKS", () => {
      expect(classifyFundTaxCategory("Bir Hisse Endeks Fonu")).toBe(
        TAX_CATEGORIES.HISSE_ENDEKS,
      );
    });

    test("hisse (no endeks) fuzzy → HISSE_YOĞUN", () => {
      expect(classifyFundTaxCategory("Bir Hisse Fonu")).toBe(
        TAX_CATEGORIES.HISSE_YOĞUN,
      );
    });

    test("altın fuzzy → ALTIN_GUMUS", () => {
      expect(classifyFundTaxCategory("Altın bazlı bir şey")).toBe(
        TAX_CATEGORIES.ALTIN_GUMUS,
      );
    });

    test("gümüş fuzzy → ALTIN_GUMUS", () => {
      expect(classifyFundTaxCategory("Gümüş bazlı fon")).toBe(
        TAX_CATEGORIES.ALTIN_GUMUS,
      );
    });

    test("kıymetli maden fuzzy → ALTIN_GUMUS", () => {
      expect(classifyFundTaxCategory("Kıymetli maden fonu")).toBe(
        TAX_CATEGORIES.ALTIN_GUMUS,
      );
    });

    test("döviz fuzzy → DOVIZ", () => {
      expect(classifyFundTaxCategory("Döviz fonu")).toBe(
        TAX_CATEGORIES.DOVIZ,
      );
    });

    test("katılım fuzzy → KATILIM", () => {
      expect(classifyFundTaxCategory("Katılım bazlı fon")).toBe(
        TAX_CATEGORIES.KATILIM,
      );
    });

    test("gayrimenkul fuzzy → GAYRIMENKUL", () => {
      expect(classifyFundTaxCategory("Gayrimenkul fonu")).toBe(
        TAX_CATEGORIES.GAYRIMENKUL,
      );
    });

    test("girişim fuzzy → GIRISIM_SERMAYESI", () => {
      expect(classifyFundTaxCategory("Girişim sermayesi")).toBe(
        TAX_CATEGORIES.GIRISIM_SERMAYESI,
      );
    });
  });

  describe("classifyFundTaxCategory - fundName heuristics", () => {
    test("hisse endeks in fund name → HISSE_ENDEKS", () => {
      expect(
        classifyFundTaxCategory("Unknown Category", "ABC Hisse Endeks Fon"),
      ).toBe(TAX_CATEGORIES.HISSE_ENDEKS);
    });

    test("hisse (no endeks) in fund name → HISSE_YOĞUN", () => {
      expect(
        classifyFundTaxCategory("Unknown Category", "Garanti Hisse"),
      ).toBe(TAX_CATEGORIES.HISSE_YOĞUN);
    });

    test("altın in fund name → ALTIN_GUMUS", () => {
      expect(
        classifyFundTaxCategory("Unknown Category", "ABC Altın Fonu"),
      ).toBe(TAX_CATEGORIES.ALTIN_GUMUS);
    });

    test("kıymetli maden in fund name → ALTIN_GUMUS", () => {
      expect(
        classifyFundTaxCategory("Unknown Category", "Kıymetli Maden Fonu"),
      ).toBe(TAX_CATEGORIES.ALTIN_GUMUS);
    });

    test("no match anywhere → DIGER", () => {
      expect(classifyFundTaxCategory("Unknown", "Unknown")).toBe(
        TAX_CATEGORIES.DIGER,
      );
    });

    test("no fundName provided → DIGER", () => {
      expect(classifyFundTaxCategory("Unknown")).toBe(TAX_CATEGORIES.DIGER);
    });
  });

  describe("getWithholdingTaxRate", () => {
    test("Hisse Yoğun is always 0", () => {
      expect(getWithholdingTaxRate(TAX_CATEGORIES.HISSE_YOĞUN)).toBe(0);
    });

    test("Diğer is always 10", () => {
      expect(getWithholdingTaxRate(TAX_CATEGORIES.DIGER)).toBe(10);
    });

    test("Altın/Gümüş without date → latest period rate (10)", () => {
      expect(getWithholdingTaxRate(TAX_CATEGORIES.ALTIN_GUMUS)).toBe(10);
    });

    test("Altın/Gümüş period 0 (2022-10-01) → 0", () => {
      expect(
        getWithholdingTaxRate(
          TAX_CATEGORIES.ALTIN_GUMUS,
          new Date("2022-10-01"),
        ),
      ).toBe(0);
    });

    test("Altın/Gümüş period 1 (2022-12-01) → 0", () => {
      expect(
        getWithholdingTaxRate(
          TAX_CATEGORIES.ALTIN_GUMUS,
          new Date("2022-12-01"),
        ),
      ).toBe(0);
    });

    test("Altın/Gümüş period 2 (2023-07-01) → 10", () => {
      expect(
        getWithholdingTaxRate(
          TAX_CATEGORIES.ALTIN_GUMUS,
          new Date("2023-07-01"),
        ),
      ).toBe(10);
    });

    test("All zero-rate categories", () => {
      expect(getWithholdingTaxRate(TAX_CATEGORIES.HISSE_ENDEKS)).toBe(0);
      expect(getWithholdingTaxRate(TAX_CATEGORIES.GIRISIM_SERMAYESI)).toBe(0);
      expect(getWithholdingTaxRate(TAX_CATEGORIES.GAYRIMENKUL)).toBe(0);
      expect(getWithholdingTaxRate(TAX_CATEGORIES.BYF_HISSE)).toBe(0);
    });

    test("BYF_DIGER is always 10", () => {
      expect(getWithholdingTaxRate(TAX_CATEGORIES.BYF_DIGER)).toBe(10);
    });

    test("Döviz period 0 → 0, current → 10", () => {
      expect(
        getWithholdingTaxRate(TAX_CATEGORIES.DOVIZ, new Date("2022-08-01")),
      ).toBe(0);
      expect(getWithholdingTaxRate(TAX_CATEGORIES.DOVIZ)).toBe(10);
    });

    test("Katılım period 0 → 0, current → 10", () => {
      expect(
        getWithholdingTaxRate(TAX_CATEGORIES.KATILIM, new Date("2022-08-01")),
      ).toBe(0);
      expect(getWithholdingTaxRate(TAX_CATEGORIES.KATILIM)).toBe(10);
    });

    test("Unknown category returns default 10", () => {
      expect(getWithholdingTaxRate("Some Unknown Category")).toBe(10);
    });

    test("Date before first period → falls back to latest rate", () => {
      // Before 2022-07-25, no period matches → returns last rate
      expect(
        getWithholdingTaxRate(
          TAX_CATEGORIES.ALTIN_GUMUS,
          new Date("2020-01-01"),
        ),
      ).toBe(10);
    });

    test("Reserved holdingDays parameter accepted", () => {
      // Third param is reserved, should not affect result
      expect(
        getWithholdingTaxRate(TAX_CATEGORIES.HISSE_YOĞUN, undefined, 365),
      ).toBe(0);
    });
  });

  describe("withholdingTaxRate (async)", () => {
    test("Hisse category → 0%", async () => {
      (getTEFASProvider as jest.Mock).mockReturnValue({
        getFundDetail: jest.fn().mockResolvedValue({
          category: "Hisse Senedi Fonu",
          name: "Test Fon",
        }),
      });

      const rate = await withholdingTaxRate("TEST");
      expect(rate).toBe(0);
    });

    test("With purchase date", async () => {
      (getTEFASProvider as jest.Mock).mockReturnValue({
        getFundDetail: jest.fn().mockResolvedValue({
          category: "Altın Fonu",
          name: "Altın Fon",
        }),
      });

      const rate = await withholdingTaxRate("GOLD", new Date("2022-10-01"));
      expect(rate).toBe(0);
    });

    test("Missing category defaults properly", async () => {
      (getTEFASProvider as jest.Mock).mockReturnValue({
        getFundDetail: jest.fn().mockResolvedValue({
          category: "",
          name: "",
        }),
      });

      const rate = await withholdingTaxRate("UNK");
      expect(rate).toBe(10); // DIGER default
    });

    test("Undefined category handled", async () => {
      (getTEFASProvider as jest.Mock).mockReturnValue({
        getFundDetail: jest.fn().mockResolvedValue({
          name: "Test",
        }),
      });

      const rate = await withholdingTaxRate("UNK2");
      expect(rate).toBe(10);
    });
  });

  describe("withholdingTaxTable", () => {
    test("returns complete table", () => {
      const table = withholdingTaxTable();
      expect(Array.isArray(table)).toBe(true);
      expect(table.length).toBe(10); // 10 categories

      for (const entry of table) {
        expect(entry).toHaveProperty("category");
        expect(entry).toHaveProperty("periods");
        expect(entry.periods.length).toBe(TAX_PERIODS.length);
        for (const period of entry.periods) {
          expect(period).toHaveProperty("label");
          expect(period).toHaveProperty("rate");
          expect(typeof period.rate).toBe("number");
        }
      }
    });
  });
});
