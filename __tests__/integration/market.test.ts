import { companies, searchCompanies } from "~/market";

describe("Market Module", () => {
  test("Market companies list", async () => {
    const list = await companies();
    expect(Array.isArray(list)).toBe(true);
  });

  test("Market companies search", async () => {
    const results = await searchCompanies("BIST");
    expect(Array.isArray(results)).toBe(true);
  });
});
