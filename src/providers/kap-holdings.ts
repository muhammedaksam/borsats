import axios from "axios";

import { APIError, DataNotAvailableError } from "~/exceptions";
import { BaseProvider } from "~/providers/base";
import { getTEFASProvider } from "~/providers/tefas";

// Portfolio Distribution Report disclosure type ID on KAP
export const PORTFOLIO_REPORT_DISCLOSURE_TYPE =
  "8aca490d502e34b801502e380044002b";

// Default OpenRouter model (aligned with borsapy)
export const OPENROUTER_MODEL = "google/gemini-3-flash-preview";

const CACHE_DURATION_MS = 3600 * 1000; // 1 hour

export interface FundHolding {
  symbol: string;
  isin: string | null;
  name: string;
  weight: number;
  holding_type: string;
  country: string | null;
  nominal_value: number | null;
  market_value: number | null;
}

export interface FundHoldingRow {
  symbol: string;
  isin: string | null;
  name: string;
  weight: number;
  type: string;
  country: string | null;
  value: number | null;
}

export interface KAPFundDisclosure {
  disclosure_id?: string | number;
  disclosure_index?: number;
  publish_date?: string;
  title?: string;
  summary?: string;
  year?: number;
  period?: number;
  attachment_count: number;
}

const EXTRACTION_PROMPT = `Extract stock holdings from this Turkish investment fund portfolio report.

For each stock row, extract:
- symbol: BIST stock ticker (4-5 letters like "ASELS", "THYAO", "GARAN") - NOT the ISIN code!
- name: Company name
- weight: Portfolio weight percentage from "Toplam%" or "Fon Toplam Değerine Oranı %" column (e.g. 5.25)
- type: "stock"
- market_value: Value in TL (number)

IMPORTANT:
- symbol must be BIST ticker (ASELS, THYAO), NOT ISIN (TRAASELS...)
- weight is percentage (usually between 0.01 and 10)
- Turkish number format: "5,25" means 5.25

Return JSON array only:
[{"symbol": "ASELS", "name": "ASELSAN", "weight": 5.25, "type": "stock", "market_value": 228500000}]
`;

/**
 * Provider for extracting fund portfolio holdings from KAP "Portföy Dağılım Raporu"
 * PDF disclosures using OpenRouter LLM parsing (aligned with borsapy's `KAPHoldingsProvider`).
 */
export class KAPHoldingsProvider extends BaseProvider {
  public static readonly DISCLOSURE_FILTER_URL =
    "https://kap.org.tr/tr/api/disclosure/filter/FILTERYFBF";
  public static readonly DISCLOSURE_PAGE_URL = "https://kap.org.tr/tr/Bildirim";
  public static readonly FILE_DOWNLOAD_URL =
    "https://kap.org.tr/tr/api/file/download";
  public static readonly FUND_INFO_URL =
    "https://www.kap.org.tr/tr/fon-bilgileri/genel";
  public static readonly OPENROUTER_URL =
    "https://openrouter.ai/api/v1/chat/completions";

  private _fundIdCache: Map<string, string> = new Map();
  private _holdingsCache: Map<
    string,
    { holdings: FundHolding[]; reportDate: Date | null; timestamp: number }
  > = new Map();

  constructor() {
    super({
      baseUrl: "https://kap.org.tr",
      timeout: 60000,
    });
  }

  /**
   * Resolve KAP fund objId (32-char hex) via TEFAS's `kap_link`.
   */
  async getFundId(fundCode: string): Promise<string | null> {
    const code = fundCode.toUpperCase();
    const cached = this._fundIdCache.get(code);
    if (cached) return cached;

    try {
      const detail = await getTEFASProvider().getFundDetail(code);
      const kapLink = detail?.kap_link;
      if (!kapLink) return null;

      const response = await this.client.get<string>(kapLink, {
        timeout: 30000,
      });
      const html =
        typeof response.data === "string"
          ? response.data
          : JSON.stringify(response.data ?? "");
      const match = html.match(/objId[\\"':]+([A-F0-9]{32})/i);
      if (match?.[1]) {
        const fundId = match[1].toUpperCase();
        this._fundIdCache.set(code, fundId);
        return fundId;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Fetch "Portföy Dağılım Raporu" disclosures for a fund from KAP.
   */
  async getDisclosures(
    fundCode: string,
    days: number = 365,
  ): Promise<KAPFundDisclosure[]> {
    const code = fundCode.toUpperCase();
    const fundId = await this.getFundId(code);
    if (!fundId) {
      throw new DataNotAvailableError(`Fund not found in KAP: ${code}`);
    }

    const url = `${KAPHoldingsProvider.DISCLOSURE_FILTER_URL}/${fundId}/${PORTFOLIO_REPORT_DISCLOSURE_TYPE}/${days}`;
    try {
      const response = await this.client.get<unknown[]>(url, {
        timeout: 30000,
      });
      const items = Array.isArray(response.data) ? response.data : [];
      return items.map((item) => {
        const basic =
          ((item as Record<string, unknown>)?.disclosureBasic as Record<
            string,
            unknown
          >) || {};
        return {
          disclosure_id: basic.disclosureId as string | number | undefined,
          disclosure_index:
            basic.disclosureIndex !== undefined
              ? Number(basic.disclosureIndex)
              : undefined,
          publish_date: basic.publishDate as string | undefined,
          title: basic.title as string | undefined,
          summary: basic.summary as string | undefined,
          year: basic.year !== undefined ? Number(basic.year) : undefined,
          period: basic.donem !== undefined ? Number(basic.donem) : undefined,
          attachment_count: Number(basic.attachmentCount || 0),
        };
      });
    } catch (err) {
      if (err instanceof DataNotAvailableError) throw err;
      throw new APIError(
        `Failed to fetch disclosures for ${code}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Get the most recent portfolio distribution report disclosure.
   */
  async getLatestDisclosure(
    fundCode: string,
  ): Promise<KAPFundDisclosure | null> {
    const disclosures = await this.getDisclosures(fundCode, 365);
    return disclosures.length > 0 ? disclosures[0] : null;
  }

  /**
   * Extract 32-hex file ID from a KAP disclosure page HTML.
   */
  async _getFileId(disclosureIndex: number): Promise<string | null> {
    const url = `${KAPHoldingsProvider.DISCLOSURE_PAGE_URL}/${disclosureIndex}`;
    try {
      const response = await this.client.get<string>(url, { timeout: 30000 });
      const html =
        typeof response.data === "string"
          ? response.data
          : JSON.stringify(response.data ?? "");
      const match = html.match(/file\/download\/([a-f0-9]{32})/i);
      return match?.[1] || null;
    } catch {
      return null;
    }
  }

  /**
   * Download attachment and strip KAP's Java serialization header before `%PDF-`.
   */
  async _downloadPdf(fileId: string): Promise<Buffer | null> {
    const url = `${KAPHoldingsProvider.FILE_DOWNLOAD_URL}/${fileId}`;
    try {
      const response = await this.client.get<ArrayBuffer>(url, {
        timeout: 60000,
        responseType: "arraybuffer",
      });
      const buf = Buffer.isBuffer(response.data)
        ? response.data
        : Buffer.from(response.data);
      const marker = buf.indexOf(Buffer.from("%PDF-"));
      if (marker !== -1) {
        return buf.subarray(marker);
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Extract JSON array bounds and normalize holdings from an LLM response string.
   */
  _parseLlmResponseText(responseText: string): FundHolding[] {
    let jsonText = responseText;
    if (jsonText.includes("```json")) {
      jsonText = jsonText.split("```json")[1].split("```")[0];
    } else if (jsonText.includes("```")) {
      jsonText = jsonText.split("```")[1].split("```")[0];
    }
    jsonText = jsonText.trim();

    const startIdx = jsonText.indexOf("[");
    if (startIdx === -1) {
      throw new APIError("No JSON array found in LLM response");
    }

    let bracketCount = 0;
    let endIdx = -1;
    for (let i = startIdx; i < jsonText.length; i++) {
      const ch = jsonText[i];
      if (ch === "[") {
        bracketCount++;
      } else if (ch === "]") {
        bracketCount--;
        if (bracketCount === 0) {
          endIdx = i + 1;
          break;
        }
      }
    }
    if (endIdx === -1) {
      endIdx = jsonText.lastIndexOf("]") + 1;
    }
    if (endIdx <= startIdx) {
      throw new APIError("Could not find valid JSON array bounds");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText.slice(startIdx, endIdx));
    } catch (err) {
      throw new APIError(
        `Failed to parse LLM response as JSON: ${(err as Error).message}`,
      );
    }

    if (!Array.isArray(parsed)) {
      throw new APIError("Expected JSON array from LLM response");
    }

    const holdings: FundHolding[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      const rawSymbol = obj.symbol;
      if (!rawSymbol) continue;
      const symbol = String(rawSymbol).replace(/\.E$/i, "").trim();
      if (!symbol) continue;

      let weight = 0;
      if (typeof obj.weight === "number") {
        weight = obj.weight;
      } else if (typeof obj.weight === "string") {
        const w = parseFloat(obj.weight.replace(",", ".").replace("%", ""));
        if (!isNaN(w)) weight = w;
      }

      // Sanity check: weight must be 0-100%
      if (weight > 100 || weight < 0) continue;

      let marketValue: number | null = null;
      if (typeof obj.market_value === "number") {
        marketValue = obj.market_value;
      } else if (typeof obj.market_value === "string") {
        const mv = parseFloat(
          obj.market_value.replace(/\./g, "").replace(",", "."),
        );
        if (!isNaN(mv)) marketValue = mv;
      }

      const nominalValue =
        typeof obj.nominal_value === "number" ? obj.nominal_value : null;

      holdings.push({
        symbol,
        isin: typeof obj.isin === "string" ? obj.isin : null,
        name: typeof obj.name === "string" && obj.name ? obj.name : symbol,
        weight,
        holding_type: typeof obj.type === "string" ? obj.type : "stock",
        country: typeof obj.country === "string" ? obj.country : null,
        nominal_value: nominalValue,
        market_value: marketValue,
      });
    }

    return this._deduplicateHoldings(holdings);
  }

  /**
   * Parse holdings from a PDF buffer using OpenRouter's native PDF file parser + LLM.
   */
  async _parseHoldingsWithLlm(
    pdfData: Buffer,
    apiKey: string,
    model: string = OPENROUTER_MODEL,
  ): Promise<FundHolding[]> {
    if (!apiKey) {
      throw new APIError("OpenRouter API key is required for holdings parsing");
    }

    const base64Pdf = pdfData.toString("base64");

    try {
      const response = await axios.post(
        KAPHoldingsProvider.OPENROUTER_URL,
        {
          model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: EXTRACTION_PROMPT },
                {
                  type: "file",
                  file: {
                    filename: "portfolio_report.pdf",
                    file_data: `data:application/pdf;base64,${base64Pdf}`,
                  },
                },
              ],
            },
          ],
          plugins: [{ id: "file-parser", pdf: { engine: "pdf-text" } }],
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 120000,
        },
      );

      const content = response.data?.choices?.[0]?.message?.content ?? "";
      if (typeof content !== "string" || !content.trim()) {
        throw new APIError("Empty response from OpenRouter LLM");
      }

      return this._parseLlmResponseText(content);
    } catch (err) {
      if (err instanceof APIError) throw err;
      throw new APIError(`LLM parsing failed: ${(err as Error).message}`);
    }
  }

  _deduplicateHoldings(holdings: FundHolding[]): FundHolding[] {
    const seen = new Set<string>();
    const unique: FundHolding[] = [];
    for (const h of holdings) {
      const key = h.isin || h.symbol;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(h);
      }
    }
    return unique;
  }

  /**
   * Get detailed portfolio holdings for a TEFAS fund using KAP disclosures + OpenRouter LLM.
   */
  async getHoldings(
    fundCode: string,
    apiKey: string,
    period?: string,
  ): Promise<FundHolding[]> {
    const code = fundCode.toUpperCase();
    const cacheKey = `${code}:${period || "latest"}`;
    const now = Date.now();

    const cached = this._holdingsCache.get(cacheKey);
    if (cached && now - cached.timestamp < CACHE_DURATION_MS) {
      return cached.holdings;
    }

    const disclosures = await this.getDisclosures(code);
    if (disclosures.length === 0) {
      throw new DataNotAvailableError(
        `No portfolio distribution reports found for ${code}`,
      );
    }

    let disclosure: KAPFundDisclosure | undefined;
    if (period) {
      const m = period.match(/^(\d{4})-(\d{2})$/);
      if (m) {
        const year = parseInt(m[1], 10);
        const month = parseInt(m[2], 10);
        disclosure = disclosures.find(
          (d) => d.year === year && d.period === month,
        );
      }
    }
    if (!disclosure) {
      disclosure = disclosures[0];
    }

    if (!disclosure.disclosure_index) {
      throw new DataNotAvailableError("Disclosure has no index");
    }

    const fileId = await this._getFileId(disclosure.disclosure_index);
    if (!fileId) {
      throw new DataNotAvailableError(
        `Could not find PDF attachment for disclosure ${disclosure.disclosure_index}`,
      );
    }

    const pdfData = await this._downloadPdf(fileId);
    if (!pdfData) {
      throw new DataNotAvailableError(
        `Failed to download PDF for file ${fileId}`,
      );
    }

    const holdings = await this._parseHoldingsWithLlm(pdfData, apiKey);

    let reportDate: Date | null = null;
    if (disclosure.year && disclosure.period) {
      reportDate = new Date(disclosure.year, disclosure.period - 1, 1);
    }

    this._holdingsCache.set(cacheKey, {
      holdings,
      reportDate,
      timestamp: now,
    });

    return holdings;
  }

  /**
   * Get holdings formatted as a flat table sorted by descending weight.
   */
  async getHoldingsTable(
    fundCode: string,
    apiKey: string,
    period?: string,
  ): Promise<FundHoldingRow[]> {
    const holdings = await this.getHoldings(fundCode, apiKey, period);
    return holdings
      .map((h) => ({
        symbol: h.symbol,
        isin: h.isin,
        name: h.name,
        weight: h.weight,
        type: h.holding_type,
        country: h.country,
        value: h.market_value,
      }))
      .sort((a, b) => b.weight - a.weight);
  }
}

let _kapHoldingsProvider: KAPHoldingsProvider | null = null;

export function getKAPHoldingsProvider(): KAPHoldingsProvider {
  if (!_kapHoldingsProvider) {
    _kapHoldingsProvider = new KAPHoldingsProvider();
  }
  return _kapHoldingsProvider;
}
