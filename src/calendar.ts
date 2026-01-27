/**
 * EconomicCalendar class for economic events - yfinance-like API.
 * Data source: doviz.com
 */

import {
  CalendarEvent,
  getCalendarProvider,
} from "~/providers/dovizcom-calendar";

export { CalendarEvent };

/**
 * Supported country codes
 */
export const COUNTRIES = [
  "TR",
  "US",
  "EU",
  "DE",
  "GB",
  "JP",
  "CN",
  "FR",
  "IT",
  "CA",
  "AU",
  "CH",
];

/**
 * Period day mappings
 */
const PERIOD_DAYS: Record<string, number> = {
  "1d": 1,
  "1w": 7,
  "2w": 14,
  "1mo": 30,
};

/**
 * EconomicCalendar class for accessing economic events
 */
export class EconomicCalendar {
  /**
   * Get economic calendar events
   */
  async events(
    options: {
      period?: string;
      start?: Date | string;
      end?: Date | string;
      country?: string | string[];
      importance?: "low" | "mid" | "high";
    } = {},
  ): Promise<CalendarEvent[]> {
    const { period = "1w", importance } = options;

    // Parse start date
    let start: Date;
    if (options.start) {
      start =
        typeof options.start === "string"
          ? new Date(options.start)
          : options.start;
    } else {
      start = new Date();
      start.setHours(0, 0, 0, 0);
    }

    // Parse end date
    let end: Date;
    if (options.end) {
      end =
        typeof options.end === "string" ? new Date(options.end) : options.end;
    } else {
      const days = PERIOD_DAYS[period] || 7;
      end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
    }

    // Parse countries
    let countries: string[];
    if (!options.country) {
      countries = ["TR", "US"];
    } else if (typeof options.country === "string") {
      countries = [options.country.toUpperCase()];
    } else {
      countries = options.country.map((c) => c.toUpperCase());
    }

    return getCalendarProvider().getEconomicCalendar({
      start,
      end,
      countries,
      importance,
    });
  }

  /**
   * Get today's economic events
   */
  async today(
    options: {
      country?: string | string[];
      importance?: "low" | "mid" | "high";
    } = {},
  ): Promise<CalendarEvent[]> {
    return this.events({ period: "1d", ...options });
  }

  /**
   * Get this week's economic events
   */
  async thisWeek(
    options: {
      country?: string | string[];
      importance?: "low" | "mid" | "high";
    } = {},
  ): Promise<CalendarEvent[]> {
    return this.events({ period: "1w", ...options });
  }

  /**
   * Get this month's economic events
   */
  async thisMonth(
    options: {
      country?: string | string[];
      importance?: "low" | "mid" | "high";
    } = {},
  ): Promise<CalendarEvent[]> {
    return this.events({ period: "1mo", ...options });
  }

  /**
   * Get high importance events only
   */
  async highImportance(
    options: {
      period?: string;
      country?: string | string[];
    } = {},
  ): Promise<CalendarEvent[]> {
    return this.events({ importance: "high", ...options });
  }

  /**
   * Get list of supported country codes
   */
  static countries(): string[] {
    return [...COUNTRIES];
  }
}

/**
 * Get economic calendar events (convenience function)
 */
export async function economicCalendar(
  options: {
    period?: string;
    country?: string | string[];
    importance?: "low" | "mid" | "high";
  } = {},
): Promise<CalendarEvent[]> {
  return new EconomicCalendar().events(options);
}
