import { getTEFASProvider } from "~/providers/tefas";
import {
  TAX_CATEGORIES,
  classifyFundTaxCategory,
  getWithholdingTaxRate,
  withholdingTaxRate,
  withholdingTaxTable,
} from "~/tax";

jest.mock("~/providers/tefas");

describe("Tax Module", () => {
  test("classifyFundTaxCategory", () => {
    expect(classifyFundTaxCategory("Hisse Senedi Fonu")).toBe(
      TAX_CATEGORIES.HISSE_YOĞUN,
    );
    expect(classifyFundTaxCategory("Hisse Senedi Yoğun Fon")).toBe(
      TAX_CATEGORIES.HISSE_YOĞUN,
    );
    expect(classifyFundTaxCategory("Altın Fonu")).toBe(
      TAX_CATEGORIES.ALTIN_GUMUS,
    );
    expect(classifyFundTaxCategory("Katılım Fonu")).toBe(
      TAX_CATEGORIES.KATILIM,
    );
    expect(classifyFundTaxCategory("Unknown Category", "Garanti Hisse")).toBe(
      TAX_CATEGORIES.HISSE_YOĞUN,
    );
    expect(classifyFundTaxCategory("Unknown", "Unknown")).toBe(
      TAX_CATEGORIES.DIGER,
    );
  });

  test("getWithholdingTaxRate", () => {
    // Hisse Yoğun is always 0
    expect(getWithholdingTaxRate(TAX_CATEGORIES.HISSE_YOĞUN)).toBe(0);
    // Diğer is always 10
    expect(getWithholdingTaxRate(TAX_CATEGORIES.DIGER)).toBe(10);
    // Altın/Gümüş depends on purchase date, but without date it defaults to latest (10)
    expect(getWithholdingTaxRate(TAX_CATEGORIES.ALTIN_GUMUS)).toBe(10);

    // Altın past period - 0% rate during that date
    expect(
      getWithholdingTaxRate(TAX_CATEGORIES.ALTIN_GUMUS, new Date("2022-10-01")),
    ).toBe(0);
  });

  test("withholdingTaxRate (async)", async () => {
    (getTEFASProvider as jest.Mock).mockReturnValue({
      getFundDetail: jest.fn().mockResolvedValue({
        category: "Hisse Senedi Fonu",
        name: "Test Fon",
      }),
    });

    const rate = await withholdingTaxRate("TEST");
    expect(rate).toBe(0);
  });

  test("withholdingTaxTable", () => {
    const table = withholdingTaxTable();
    expect(Array.isArray(table)).toBe(true);
    expect(table.length).toBeGreaterThan(0);
    expect(table[0]).toHaveProperty("category");
    expect(table[0]).toHaveProperty("periods");
  });
});
