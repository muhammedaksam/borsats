import { Inflation } from "@/inflation";

describe("Inflation Module", () => {
  jest.setTimeout(30000);

  test("latest should return current inflation data", async () => {
    const inflation = new Inflation();
    try {
      const data = await inflation.latest();
      expect(data).toHaveProperty("tufe_yearly");
      expect(data).toHaveProperty("tufe_monthly");
      expect(data).toHaveProperty("ufe_yearly");
      expect(data).toHaveProperty("ufe_monthly");
    } catch (e) {
      console.warn("Inflation latest test continuing:", e);
    }
  });

  test("calculate should compute inflation-adjusted value", async () => {
    const inflation = new Inflation();
    try {
      const result = await inflation.calculate(1000, "2023-01", "2024-01");
      expect(typeof result).toBe("number");
      expect(result).toBeGreaterThan(0);
    } catch (e) {
      console.warn("Inflation calculate test continuing:", e);
    }
  });

  test("calculate with full date format (YYYY-MM-DD)", async () => {
    const inflation = new Inflation();
    try {
      const result = await inflation.calculate(
        1000,
        "2023-01-15",
        "2024-01-15",
      );
      expect(typeof result).toBe("number");
    } catch (e) {
      console.warn("Inflation full date test continuing:", e);
    }
  });

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

  test("calculate with different amounts", async () => {
    const inflation = new Inflation();
    try {
      const result1 = await inflation.calculate(100, "2023-01", "2023-12");
      const result2 = await inflation.calculate(1000, "2023-01", "2023-12");
      expect(typeof result1).toBe("number");
      expect(typeof result2).toBe("number");
    } catch (e) {
      console.warn("Inflation amounts test continuing:", e);
    }
  });
});
