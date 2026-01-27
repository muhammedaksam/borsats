import * as cheerio from "cheerio";

import { APIError } from "~/exceptions";
import { BaseProvider } from "~/providers/base";
import { TTL } from "~/utils/helpers";

export interface VIOPContract {
  code: string;
  contract: string;
  price: number | null;
  change: number | null;
  volumeTL: number | null;
  volumeQty: number | null;
  category: string;
}

const SECTIONS: Record<string, string> = {
  stock_futures: "Pay Vadeli İşlem Ana Pazarı",
  index_futures: "Endeks Vadeli İşlem Ana Pazarı",
  currency_futures: "Döviz Vadeli İşlem Ana Pazarı",
  commodity_futures: "Kıymetli Madenler Vadeli İşlem Ana Pazarı",
  stock_options: "Pay Opsiyon Ana Pazarı",
  index_options: "Endeks Opsiyon Ana Pazarı",
};

export class VIOPProvider extends BaseProvider {
  private static readonly URL =
    "https://www.isyatirim.com.tr/tr-tr/analiz/Sayfalar/viop.aspx";

  private async fetchPage(): Promise<cheerio.CheerioAPI> {
    const cacheKey = "viop:page";
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as cheerio.CheerioAPI;
    }

    try {
      const response = await this.client.get(VIOPProvider.URL, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "text/html",
        },
      });

      const $ = cheerio.load(response.data);
      this.cache.set(cacheKey, $, TTL.VIOP || 300);
      return $;
    } catch (e) {
      throw new APIError(`Failed to fetch VIOP page: ${(e as Error).message}`);
    }
  }

  private parseTable(
    $: cheerio.CheerioAPI,
    sectionName: string,
  ): VIOPContract[] {
    const rows: VIOPContract[] = [];

    // Find accordion with the section name
    const accordionEl = $("a")
      .filter((_, el) => $(el).text().trim() === sectionName)
      .closest("div.accordion-item");

    if (!accordionEl.length) return rows;

    const table = accordionEl.find("table");
    if (!table.length) return rows;

    table.find("tr").each((_, tr) => {
      const tds = $(tr).find("td");
      if (tds.length >= 5) {
        const firstTd = tds.eq(0);
        const title = firstTd.attr("title") || "";
        let contractCode = "";
        if (title.includes("|")) {
          contractCode = title.split("|")[0].trim();
        }

        const contractName = firstTd.text().trim();
        const price = this.parseNumber(tds.eq(1).text().trim());
        const change = this.parseNumber(tds.eq(2).text().trim());
        const volumeTL = this.parseNumber(tds.eq(3).text().trim());
        const volumeQty = this.parseNumber(tds.eq(4).text().trim());

        rows.push({
          code: contractCode,
          contract: contractName,
          price,
          change,
          volumeTL,
          volumeQty,
          category: "",
        });
      }
    });

    return rows;
  }

  private parseNumber(text: string): number | null {
    if (!text) return null;
    try {
      const cleaned = text.replace(/\./g, "").replace(",", ".");
      const num = parseFloat(cleaned);
      return isNaN(num) ? null : num;
    } catch {
      return null;
    }
  }

  async getFutures(
    category: "all" | "stock" | "index" | "currency" | "commodity" = "all",
  ): Promise<VIOPContract[]> {
    const $ = await this.fetchPage();

    const categoryMap: Record<string, string[]> = {
      stock: ["stock_futures"],
      index: ["index_futures"],
      currency: ["currency_futures"],
      commodity: ["commodity_futures"],
      all: [
        "stock_futures",
        "index_futures",
        "currency_futures",
        "commodity_futures",
      ],
    };

    const sections = categoryMap[category] || categoryMap.all;
    const allContracts: VIOPContract[] = [];

    for (const sectionKey of sections) {
      const sectionName = SECTIONS[sectionKey];
      if (sectionName) {
        const contracts = this.parseTable($, sectionName);
        contracts.forEach((c) => {
          c.category = sectionKey.replace("_futures", "");
        });
        allContracts.push(...contracts);
      }
    }

    return allContracts;
  }

  async getOptions(
    category: "all" | "stock" | "index" = "all",
  ): Promise<VIOPContract[]> {
    const $ = await this.fetchPage();

    const categoryMap: Record<string, string[]> = {
      stock: ["stock_options"],
      index: ["index_options"],
      all: ["stock_options", "index_options"],
    };

    const sections = categoryMap[category] || categoryMap.all;
    const allContracts: VIOPContract[] = [];

    for (const sectionKey of sections) {
      const sectionName = SECTIONS[sectionKey];
      if (sectionName) {
        const contracts = this.parseTable($, sectionName);
        contracts.forEach((c) => {
          c.category = sectionKey.replace("_options", "");
        });
        allContracts.push(...contracts);
      }
    }

    return allContracts;
  }

  async getAll(): Promise<{
    futures: VIOPContract[];
    options: VIOPContract[];
  }> {
    return {
      futures: await this.getFutures("all"),
      options: await this.getOptions("all"),
    };
  }
}

let _viopProvider: VIOPProvider | null = null;

export function getVIOPProvider(): VIOPProvider {
  if (!_viopProvider) {
    _viopProvider = new VIOPProvider();
  }
  return _viopProvider;
}
