/**
 * Doviz.com Economic Calendar provider.
 * API: https://www.doviz.com/calendar/getCalendarEvents
 */

import { APIError } from "@/exceptions";
import { BaseProvider } from "@/providers/base";
import { TTL } from "@/utils/helpers";
import * as cheerio from "cheerio";

export interface CalendarEvent {
  date: Date;
  time: string | null;
  countryCode: string;
  country: string;
  event: string;
  importance: "low" | "mid" | "high";
  period: string;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
}

const COUNTRY_MAP: Record<string, string> = {
  TR: "Türkiye",
  US: "ABD",
  EU: "Euro Bölgesi",
  DE: "Almanya",
  GB: "Birleşik Krallık",
  JP: "Japonya",
  CN: "Çin",
  FR: "Fransa",
  IT: "İtalya",
  CA: "Kanada",
  AU: "Avustralya",
  CH: "İsviçre",
  KR: "Güney Kore",
  BR: "Brezilya",
  IN: "Hindistan",
  RU: "Rusya",
};

const TURKISH_MONTHS: Record<string, number> = {
  Ocak: 1,
  Şubat: 2,
  Mart: 3,
  Nisan: 4,
  Mayıs: 5,
  Haziran: 6,
  Temmuz: 7,
  Ağustos: 8,
  Eylül: 9,
  Ekim: 10,
  Kasım: 11,
  Aralık: 12,
};

export class DovizcomCalendarProvider extends BaseProvider {
  private static readonly BASE_URL =
    "https://www.doviz.com/calendar/getCalendarEvents";
  private static readonly BEARER_TOKEN =
    "d00c1214cbca6a7a1b4728a8cc78cd69ba99e0d2ddb6d0687d2ed34f6a547b48";

  private parseTurkishDate(dateStr: string): Date | null {
    try {
      const parts = dateStr.trim().split(" ");
      if (parts.length === 3) {
        const day = parseInt(parts[0]);
        const month = TURKISH_MONTHS[parts[1]];
        const year = parseInt(parts[2]);
        if (month) {
          return new Date(year, month - 1, day);
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  private parseTime(timeStr: string): string | null {
    if (!timeStr) return null;
    const cleaned = timeStr.trim();
    if (/^\d{1,2}:\d{2}$/.test(cleaned)) {
      return cleaned;
    }
    return null;
  }

  private extractPeriod(eventName: string): string {
    const match = eventName.match(/\(([^)]+)\)$/);
    return match ? match[1] : "";
  }

  private parseHtml(html: string, countryCode: string): CalendarEvent[] {
    const $ = cheerio.load(html);
    const events: CalendarEvent[] = [];
    let currentDate: Date | null = null;

    $("div[id*='calendar-content-']").each((_, contentDiv) => {
      const dateHeader = $(contentDiv).find(
        "div.text-center.mt-8.mb-8.text-bold",
      );
      if (dateHeader.length) {
        currentDate = this.parseTurkishDate(dateHeader.text());
      }

      $(contentDiv)
        .find("tr")
        .each((_, row) => {
          const cells = $(row).find("td");
          if (cells.length >= 7 && currentDate) {
            try {
              const timeCell = cells.eq(0);
              const importanceCell = cells.eq(2);
              const eventCell = cells.eq(3);
              const actualCell = cells.eq(4);
              const expectedCell = cells.eq(5);
              const previousCell = cells.eq(6);

              const eventTime = this.parseTime(timeCell.text().trim());
              const eventName = eventCell.text().trim();

              let importance: "low" | "mid" | "high" = "low";
              const impSpan = importanceCell.find("span[class*='importance']");
              if (impSpan.length) {
                const classes = impSpan.attr("class") || "";
                if (classes.includes("high")) importance = "high";
                else if (classes.includes("mid")) importance = "mid";
              }

              const actual = actualCell.text().trim() || null;
              const forecast = expectedCell.text().trim() || null;
              const previous = previousCell.text().trim() || null;

              if (eventName) {
                events.push({
                  date: currentDate,
                  time: eventTime,
                  countryCode,
                  country: COUNTRY_MAP[countryCode] || countryCode,
                  event: eventName,
                  importance,
                  period: this.extractPeriod(eventName),
                  actual,
                  forecast,
                  previous,
                });
              }
            } catch {
              // ignore
            }
          }
        });
    });

    return events;
  }

  async getEconomicCalendar(
    options: {
      start?: Date;
      end?: Date;
      countries?: string[];
      importance?: "low" | "mid" | "high";
    } = {},
  ): Promise<CalendarEvent[]> {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const start = options.start || now;
    const end =
      options.end || new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    const countries = options.countries || ["TR", "US"];
    const importance = options.importance;

    const cacheKey = `dovizcom:calendar:${start.toISOString().split("T")[0]}:${end.toISOString().split("T")[0]}:${countries.join(",")}:${importance || "all"}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached as CalendarEvent[];

    const allEvents: CalendarEvent[] = [];

    for (const countryCode of countries) {
      try {
        let importanceParam = "3,2,1";
        if (importance === "high") importanceParam = "3";
        else if (importance === "mid") importanceParam = "3,2";

        const response = await this.client.get(
          DovizcomCalendarProvider.BASE_URL,
          {
            params: {
              country: countryCode,
              importance: importanceParam,
            },
            headers: {
              Authorization: `Bearer ${DovizcomCalendarProvider.BEARER_TOKEN}`,
              Accept: "application/json",
            },
          },
        );

        const data = response.data;
        if (!data.calendarHTML) continue;

        const events = this.parseHtml(data.calendarHTML, countryCode);

        for (const event of events) {
          const eventDate = event.date;
          if (eventDate >= start && eventDate <= end) {
            if (importance && event.importance !== importance) continue;
            allEvents.push(event);
          }
        }
      } catch (e) {
        throw new APIError(
          `Failed to fetch calendar for ${countryCode}: ${(e as Error).message}`,
        );
      }
    }

    allEvents.sort((a, b) => {
      const dateComp = a.date.getTime() - b.date.getTime();
      if (dateComp !== 0) return dateComp;
      return (a.time || "99:99").localeCompare(b.time || "99:99");
    });

    this.cache.set(cacheKey, allEvents, TTL.OHLCV_HISTORY);
    return allEvents;
  }
}

let _calendarProvider: DovizcomCalendarProvider | null = null;

export function getCalendarProvider(): DovizcomCalendarProvider {
  if (!_calendarProvider) {
    _calendarProvider = new DovizcomCalendarProvider();
  }
  return _calendarProvider;
}
