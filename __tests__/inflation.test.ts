import { Inflation } from "~/inflation";
import { resilientTest } from "./helpers/network-utils";

describe("Inflation Module", () => {
  jest.setTimeout(30000);

  test(
    "latest should return current inflation data",
    resilientTest(async () => {
      const inflation = new Inflation();
      const data = await inflation.latest();
      expect(data).toHaveProperty("year");
      expect(data).toHaveProperty("month");
      expect(data).toHaveProperty("value");
      expect(data).toHaveProperty("monthlyChange");
      expect(data).toHaveProperty("annualChange");
    }),
    90000,
  );

  test(
    "calculate should compute inflation-adjusted value",
    resilientTest(async () => {
      const inflation = new Inflation();
      const result = await inflation.calculate(1000, "2023-01", "2024-01");
      expect(typeof result.finalAmount).toBe("number");
      expect(result.finalAmount).toBeGreaterThan(0);
    }),
    90000,
  );

  test(
    "calculate with full date format (YYYY-MM-DD)",
    resilientTest(async () => {
      const inflation = new Inflation();
      const result = await inflation.calculate(
        1000,
        "2023-01-15",
        "2024-01-15",
      );
      expect(typeof result.finalAmount).toBe("number");
    }),
    90000,
  );

  test("calculate should throw error for invalid start date", async () => {
    const inflation = new Inflation();
    await expect(
      inflation.calculate(1000, "invalid", "2024-01"),
    ).rejects.toThrow("Invalid date format");
  });

  test("calculate should throw error for invalid end date", async () => {
    const inflation = new Inflation();
    await expect(
      inflation.calculate(1000, "2023-01", "invalid"),
    ).rejects.toThrow("Invalid date format");
  });

  test(
    "calculate with different amounts",
    resilientTest(async () => {
      const inflation = new Inflation();
      const result1 = await inflation.calculate(100, "2023-01", "2023-12");
      const result2 = await inflation.calculate(1000, "2023-01", "2023-12");
      expect(typeof result1.finalAmount).toBe("number");
      expect(typeof result2.finalAmount).toBe("number");
    }),
    90000,
  );
});
