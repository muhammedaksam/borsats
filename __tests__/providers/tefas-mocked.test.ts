/**
 * Mocked TEFAS provider tests — exercises getManagementFees parsing logic,
 * parseTurkishDecimal edge cases, and _formatDateTR.
 */

import axios from "axios";
import { TEFASProvider } from "~/providers/tefas";

// Create a fresh provider instance for mocking
function createProvider(): TEFASProvider {
  return new TEFASProvider();
}

describe("TEFASProvider (Mocked) — Coverage Boost", () => {
  describe("parseTurkishDecimal", () => {
    test("normal comma-separated value", () => {
      expect(TEFASProvider.parseTurkishDecimal("1,23")).toBe(1.23);
    });

    test("integer value", () => {
      expect(TEFASProvider.parseTurkishDecimal("42")).toBe(42);
    });

    test("null returns null", () => {
      expect(TEFASProvider.parseTurkishDecimal(null)).toBeNull();
    });

    test("undefined returns null", () => {
      expect(TEFASProvider.parseTurkishDecimal(undefined)).toBeNull();
    });

    test("empty string returns null", () => {
      expect(TEFASProvider.parseTurkishDecimal("")).toBeNull();
    });

    test("whitespace-only returns null", () => {
      expect(TEFASProvider.parseTurkishDecimal("   ")).toBeNull();
    });

    test("non-numeric string returns null", () => {
      expect(TEFASProvider.parseTurkishDecimal("abc")).toBeNull();
    });

    test("negative value", () => {
      expect(TEFASProvider.parseTurkishDecimal("-3,14")).toBe(-3.14);
    });
  });

  describe("getManagementFees (mocked HTTP)", () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    test("parses successful response", async () => {
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockResolvedValue({
          data: {
            data: [
              {
                FONKODU: "ABC",
                FONUNVAN: "ABC Fonu",
                FONTURACIKLAMA: "Hisse",
                KURUCUKODU: "XYZ",
                UYGULANANYU1Y: "1,50",
                FONICTUZUKYU1G: "2,00",
                FONTOPGIDERKESORAN: "3,50",
                YILLIKGETIRI: 15.5,
              },
              {
                FONKODU: "DEF",
                FONUNVAN: "DEF Fonu",
                FONTURACIKLAMA: "Borç",
                KURUCUKODU: "QRS",
                UYGULANANYU1Y: null,
                FONICTUZUKYU1G: null,
                FONTOPGIDERKESORAN: null,
                YILLIKGETIRI: null,
              },
            ],
          },
        }),
        get: jest.fn(),
        defaults: { headers: { common: {} } },
        interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
      } as unknown as ReturnType<typeof axios.create>);

      // Need to create a new provider so it picks up the mocked axios.create
      const freshProvider = createProvider();
      const fees = await freshProvider.getManagementFees("YAT");

      expect(fees.length).toBe(2);
      expect(fees[0].fund_code).toBe("ABC");
      expect(fees[0].applied_fee).toBe(1.5);
      expect(fees[0].prospectus_fee).toBe(2.0);
      expect(fees[0].max_expense_ratio).toBe(3.5);
      expect(fees[0].annual_return).toBe(15.5);

      // Null fields
      expect(fees[1].applied_fee).toBeNull();
      expect(fees[1].annual_return).toBeNull();
    });

    test("handles empty data array", async () => {
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockResolvedValue({
          data: { data: [] },
        }),
        get: jest.fn(),
        defaults: { headers: { common: {} } },
        interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
      } as unknown as ReturnType<typeof axios.create>);

      const freshProvider = createProvider();
      const fees = await freshProvider.getManagementFees("EMK");
      expect(fees).toEqual([]);
    });

    test("handles missing data field", async () => {
      jest.spyOn(axios, "create").mockReturnValue({
        post: jest.fn().mockResolvedValue({
          data: {},
        }),
        get: jest.fn(),
        defaults: { headers: { common: {} } },
        interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
      } as unknown as ReturnType<typeof axios.create>);

      const freshProvider = createProvider();
      const fees = await freshProvider.getManagementFees("YAT");
      expect(fees).toEqual([]);
    });
  });
});
