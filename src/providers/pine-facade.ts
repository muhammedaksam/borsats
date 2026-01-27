import {
  APIError,
  AuthenticationError,
  DataNotAvailableError,
} from "@/exceptions";
import { BaseProvider } from "@/providers/base";

// Standard TradingView indicators
export const STANDARD_INDICATORS: Record<string, string> = {
  RSI: "STD;RSI",
  MACD: "STD;MACD",
  BB: "STD;BB",
  BOLLINGER: "STD;BB",
  EMA: "STD;EMA",
  SMA: "STD;SMA",
  STOCHASTIC: "STD;Stochastic",
  STOCH: "STD;Stochastic",
  ATR: "STD;ATR",
  ADX: "STD;ADX",
  OBV: "STD;OBV",
  VWAP: "STD;VWAP",
  ICHIMOKU: "STD;Ichimoku%Cloud",
  SUPERTREND: "STD;Supertrend",
  PSAR: "STD;Parabolic%SAR",
  CCI: "STD;CCI",
  MFI: "STD;MFI",
  ROC: "STD;ROC",
  WILLIAMS: "STD;Williams%25R",
  CMF: "STD;CMF",
  VOLUME: "STD;Volume",
};

// Output field mappings
export const INDICATOR_OUTPUTS: Record<string, Record<string, string>> = {
  "STD;RSI": { plot_0: "value" },
  "STD;MACD": { plot_0: "macd", plot_1: "signal", plot_2: "histogram" },
  "STD;BB": { plot_0: "middle", plot_1: "upper", plot_2: "lower" },
  "STD;EMA": { plot_0: "value" },
  "STD;SMA": { plot_0: "value" },
  "STD;Stochastic": { plot_0: "k", plot_1: "d" },
  "STD;ATR": { plot_0: "value" },
  "STD;ADX": { plot_0: "adx", plot_1: "plus_di", plot_2: "minus_di" },
  "STD;OBV": { plot_0: "value" },
  "STD;VWAP": { plot_0: "value" },
  "STD;CCI": { plot_0: "value" },
  "STD;MFI": { plot_0: "value" },
  "STD;ROC": { plot_0: "value" },
  "STD;CMF": { plot_0: "value" },
};

interface RawPineInput {
  name?: string;
  type?: string;
  defval?: unknown;
  min?: number;
  max?: number;
  options?: unknown[];
  tooltip?: string;
}

interface RawPinePlot {
  id?: string;
  type?: string;
  title?: string;
}

interface RawPineResponse {
  version?: string;
  inputs?: RawPineInput[];
  plots?: RawPinePlot[];
}

export interface IndicatorMetadata {
  pineId: string;
  pineVersion: string;
  inputs: Record<string, unknown>;
  plots: Record<string, unknown>;
  defaults: Record<string, unknown>;
  output_mapping?: Record<string, string>;
}

export class PineFacadeProvider extends BaseProvider {
  private static readonly BASE_URL =
    "https://pine-facade.tradingview.com/pine-facade";

  // Cache for indicators
  private _indicatorCache: Record<string, IndicatorMetadata> = {};

  constructor() {
    super();
  }

  async getIndicator(
    indicatorId: string,
    version: string = "last",
    session?: string,
    signature?: string,
  ): Promise<IndicatorMetadata> {
    const normalizedId = this._normalizeIndicatorId(indicatorId);

    // Check if auth is needed
    if (this._needsAuth(normalizedId) && !session) {
      throw new AuthenticationError(
        `Custom indicator '${indicatorId}' requires TradingView authentication.`,
      );
    }

    const cacheKey = `${normalizedId}:${version}:${session || ""}`;
    if (this._indicatorCache[cacheKey]) {
      return this._indicatorCache[cacheKey];
    }

    const encodedId = encodeURIComponent(normalizedId);
    const url = `${PineFacadeProvider.BASE_URL}/translate/${encodedId}/${version}`;

    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0", // Use standard UA
      Origin: "https://www.tradingview.com",
      Referer: "https://www.tradingview.com/",
    };

    if (session) {
      let cookie = `sessionid=${session}`;
      if (signature) {
        cookie += `; sessionid_sign=${signature}`;
      }
      headers["Cookie"] = cookie;
    }

    try {
      const response = await this.client.get(url, { headers });
      const data = response.data;
      const parsed = this._parseIndicatorResponse(indicatorId, data);

      this._indicatorCache[cacheKey] = parsed;
      return parsed;
    } catch (error: unknown) {
      const err = error as { response?: { status: number }; message: string };
      if (err.response?.status === 401 || err.response?.status === 403) {
        throw new AuthenticationError(
          `Access denied for indicator '${indicatorId}'`,
        );
      }
      if (err.response?.status === 404) {
        throw new DataNotAvailableError(`Indicator '${indicatorId}' not found`);
      }
      throw new APIError(
        `Failed to fetch indicator '${indicatorId}': ${err.message}`,
      );
    }
  }

  getOutputMapping(indicatorId: string): Record<string, string> {
    const normalized = this._normalizeIndicatorId(indicatorId);
    return INDICATOR_OUTPUTS[normalized] || {};
  }

  private _normalizeIndicatorId(indicatorId: string): string {
    const upper = indicatorId.toUpperCase();
    if (STANDARD_INDICATORS[upper]) {
      return STANDARD_INDICATORS[upper];
    }
    if (indicatorId.includes(";")) {
      return indicatorId;
    }
    return `STD;${indicatorId}`;
  }

  private _needsAuth(indicatorId: string): boolean {
    return indicatorId.startsWith("USER;") || indicatorId.startsWith("PUB;");
  }

  private _parseIndicatorResponse(
    id: string,
    data: unknown,
  ): IndicatorMetadata {
    const rawData = data as RawPineResponse;
    const result: IndicatorMetadata = {
      pineId: id,
      pineVersion: rawData.version || "last",
      inputs: {},
      plots: {},
      defaults: {},
    };

    if (Array.isArray(rawData.inputs)) {
      rawData.inputs.forEach((inp: RawPineInput, i: number) => {
        if (inp && typeof inp === "object") {
          const name = inp.name || `in_${i}`;
          result.inputs[name] = {
            name,
            type: inp.type || "integer",
            defval: inp.defval,
            min: inp.min,
            max: inp.max,
            options: inp.options,
            tooltip: inp.tooltip,
          };
          if (inp.defval !== undefined) {
            result.defaults[name] = inp.defval;
          }
        }
      });
    }

    if (Array.isArray(rawData.plots)) {
      rawData.plots.forEach((plot: RawPinePlot, i: number) => {
        if (plot && typeof plot === "object") {
          const plotId = plot.id || `plot_${i}`;
          result.plots[plotId] = {
            id: plotId,
            type: plot.type || "line",
            title: plot.title,
          };
        }
      });
    }

    if (INDICATOR_OUTPUTS[this._normalizeIndicatorId(id)]) {
      result.output_mapping = INDICATOR_OUTPUTS[this._normalizeIndicatorId(id)];
    }

    return result;
  }
}

let _pineFacadeProvider: PineFacadeProvider | null = null;

export function getPineFacadeProvider(): PineFacadeProvider {
  if (!_pineFacadeProvider) {
    _pineFacadeProvider = new PineFacadeProvider();
  }
  return _pineFacadeProvider;
}
