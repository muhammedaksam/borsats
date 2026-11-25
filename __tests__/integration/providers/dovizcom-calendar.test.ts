import { getCalendarProvider } from "~/providers/dovizcom-calendar";

describe("DovizcomCalendarProvider", () => {
  const provider = getCalendarProvider();

  jest.setTimeout(20000);

  describe("getEconomicCalendar", () => {
    it("should fetch economic calendar for TR", async () => {
      const events = await provider.getEconomicCalendar({
        countries: ["TR"],
      });

      expect(Array.isArray(events)).toBe(true);
      // May have no events depending on the week
      if (events.length > 0) {
        const event = events[0];
        expect(event).toHaveProperty("date");
        expect(event).toHaveProperty("event");
        expect(event).toHaveProperty("importance");
        expect(event.countryCode).toBe("TR");
        expect(["low", "mid", "high"]).toContain(event.importance);
      }
    });

    it("should fetch calendar for multiple countries", async () => {
      const events = await provider.getEconomicCalendar({
        countries: ["TR", "US"],
      });

      expect(Array.isArray(events)).toBe(true);
      if (events.length > 0) {
        const countries = new Set(events.map((e) => e.countryCode));
        // At least one country should have events
        expect(countries.size).toBeGreaterThanOrEqual(1);
      }
    });

    it("should filter by importance", async () => {
      const events = await provider.getEconomicCalendar({
        countries: ["US"],
        importance: "high",
      });

      expect(Array.isArray(events)).toBe(true);
      events.forEach((event) => {
        expect(event.importance).toBe("high");
      });
    });

    it("should handle custom date range", async () => {
      const start = new Date();
      const end = new Date(start.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days

      const events = await provider.getEconomicCalendar({
        start,
        end,
        countries: ["TR"],
      });

      expect(Array.isArray(events)).toBe(true);
    });
  });
});
