import { EconomicCalendar, economicCalendar } from "@/calendar";

describe("Economic Calendar", () => {
  const cal = new EconomicCalendar();

  test("events should return calendar events", async () => {
    const events = await cal.events({ period: "1w" });
    expect(Array.isArray(events)).toBe(true);
  });

  test("today should return events", async () => {
    const events = await cal.today();
    expect(Array.isArray(events)).toBe(true);
  });

  test("thisWeek should return events", async () => {
    const events = await cal.thisWeek();
    expect(Array.isArray(events)).toBe(true);
  });

  test("thisMonth should return events", async () => {
    const events = await cal.thisMonth();
    expect(Array.isArray(events)).toBe(true);
  });

  test("highImportance should return events", async () => {
    const events = await cal.highImportance();
    expect(Array.isArray(events)).toBe(true);
  });

  test("static countries should return country list", () => {
    const countries = EconomicCalendar.countries();
    expect(countries).toContain("TR");
    expect(countries).toContain("US");
  });

  test("economicCalendar convenience function", async () => {
    const events = await economicCalendar({ period: "1d" });
    expect(Array.isArray(events)).toBe(true);
  });

  test("should handle different country formats", async () => {
    await expect(cal.events({ country: "tr" })).resolves.toBeDefined();
    await expect(cal.events({ country: ["tr", "us"] })).resolves.toBeDefined();
  });
});
