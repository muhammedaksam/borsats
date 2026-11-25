import { INDICES } from "~/bist-index";
import { OutputFormat } from "~/cli/formatters";

export type AssetType = "stock" | "fx" | "crypto" | "fund" | "index";

const FX_CODES = new Set([
  "USD",
  "EUR",
  "GBP",
  "CHF",
  "JPY",
  "CAD",
  "AUD",
  "DKK",
  "SEK",
  "NOK",
  "SAR",
  "RUB",
  "CNY",
  "AED",
  "BRENT",
  "WTI",
  "XAU",
  "XAG",
  "XPT",
  "XPD",
]);

export function detectAssetType(symbol: string): AssetType {
  const upper = symbol.toUpperCase();
  const lower = symbol.toLowerCase();

  if (lower.includes("-") || FX_CODES.has(upper)) {
    return "fx";
  }
  if (
    (upper.endsWith("TRY") || upper.endsWith("USDT")) &&
    upper.length > 4 &&
    !INDICES[upper]
  ) {
    return "crypto";
  }
  if (INDICES[upper] || /^X[A-Z0-9]{3,5}$/.test(upper)) {
    return "index";
  }
  if (/^[A-Z0-9]{3}$/.test(upper)) {
    return "fund";
  }
  return "stock";
}

export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean | string[]>;
}

const VALUE_FLAGS = new Set([
  "output",
  "o",
  "type",
  "t",
  "period",
  "p",
  "interval",
  "i",
  "limit",
  "l",
  "n",
  "index",
  "x",
  "sector",
  "s",
  "search",
  "rec",
  "r",
  "template",
  "mcap-min",
  "mcap-max",
  "pe-min",
  "pe-max",
  "pb-min",
  "pb-max",
  "div-min",
  "roe-min",
  "upside-min",
  "foreign-min",
  "exchange",
  "e",
  "country",
  "c",
  "importance",
  "currency",
  "bank",
  "b",
  "institution",
  "indicator",
  "compare",
  "min-return-1y",
  "min-return-ytd",
  "api-key",
  "group",
  "g",
  "start",
  "end",
  "username",
  "u",
  "password",
  "session",
  "session-sign",
  "duration",
  "d",
]);

const BOOLEAN_FLAGS = new Set([
  "help",
  "h",
  "version",
  "v",
  "risk-free",
  "actions",
  "a",
  "all",
  "detail",
  "balance",
  "income",
  "cashflow",
  "quarterly",
  "q",
  "ttm",
  "allocation",
  "holdings",
  "risk",
  "screen",
  "banks",
  "institutions",
  "etf",
  "symbols",
  "list",
  "history",
  "recommendations",
  "summary",
]);

const REPEATABLE_FLAGS = new Set(["indicator", "compare"]);

export function parseCliArgs(
  argv: string[],
  commandBooleans: Set<string> = new Set(),
): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean | string[]> = {};

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("-") || token === "-") {
      positional.push(token);
      continue;
    }

    const eqIdx = token.indexOf("=");
    if (eqIdx !== -1) {
      const key = token.slice(0, eqIdx).replace(/^-+/, "");
      const val = token.slice(eqIdx + 1);
      setFlagValue(flags, key, val);
      continue;
    }

    const key = token.replace(/^-+/, "");
    const next = argv[i + 1];
    const isBool =
      commandBooleans.has(key) ||
      (BOOLEAN_FLAGS.has(key) && !VALUE_FLAGS.has(key));

    if (!isBool && next !== undefined && !next.startsWith("-")) {
      setFlagValue(flags, key, next);
      i++;
    } else {
      flags[key] = true;
    }
  }

  return { positional, flags };
}

function setFlagValue(
  flags: Record<string, string | boolean | string[]>,
  key: string,
  val: string,
): void {
  if (REPEATABLE_FLAGS.has(key)) {
    const prev = flags[key];
    if (Array.isArray(prev)) {
      prev.push(val);
    } else if (typeof prev === "string") {
      flags[key] = [prev, val];
    } else {
      flags[key] = [val];
    }
  } else {
    flags[key] = val;
  }
}

export function getStringFlag(
  flags: ParsedArgs["flags"],
  ...names: string[]
): string | undefined {
  for (const name of names) {
    const val = flags[name];
    if (typeof val === "string") return val;
    if (Array.isArray(val) && val.length > 0) return val[0];
  }
  return undefined;
}

export function getListFlag(
  flags: ParsedArgs["flags"],
  ...names: string[]
): string[] {
  const out: string[] = [];
  for (const name of names) {
    const val = flags[name];
    if (Array.isArray(val)) out.push(...val);
    else if (typeof val === "string") out.push(val);
  }
  return out;
}

export function getBoolFlag(
  flags: ParsedArgs["flags"],
  ...names: string[]
): boolean {
  return names.some((n) => flags[n] === true);
}

export function getNumberFlag(
  flags: ParsedArgs["flags"],
  ...names: string[]
): number | undefined {
  const s = getStringFlag(flags, ...names);
  if (s === undefined) return undefined;
  const n = Number(s);
  return isNaN(n) ? undefined : n;
}

export function getOutputFormat(flags: ParsedArgs["flags"]): OutputFormat {
  const raw = (getStringFlag(flags, "output", "o") || "table").toLowerCase();
  if (raw === "json" || raw === "csv" || raw === "table") return raw;
  return "table";
}
