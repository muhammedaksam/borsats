import { allIndices, Index, indices } from "~/bist-index";
import { Bond, bonds, riskFreeRate } from "~/bond";
import { EconomicCalendar } from "~/calendar";
import { formatOutput } from "~/cli/formatters";
import {
  AssetType,
  detectAssetType,
  getBoolFlag,
  getListFlag,
  getNumberFlag,
  getOutputFormat,
  getStringFlag,
  parseCliArgs,
} from "~/cli/utils";
import { Crypto } from "~/crypto";
import { Eurobond, eurobonds } from "~/eurobond";
import { compareFunds, Fund, screenFunds } from "~/fund";
import { banks, FX, metalInstitutions } from "~/fx";
import { Inflation } from "~/inflation";
import { companies, searchCompanies } from "~/market";
import {
  clearTradingViewAuth,
  getTradingViewAuth,
  setTradingViewAuth,
} from "~/providers/tradingview";
import { scan } from "~/scanner";
import { screenStocks } from "~/screener";
import { search, viopContracts } from "~/search";
import { createStream } from "~/stream";
import { TCMB } from "~/tcmb";
import { Ticker } from "~/ticker";
import { Interval, Period } from "~/types";
import { VIOP } from "~/viop";

export interface CliIO {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export type CommandHandler = (argv: string[], io: CliIO) => Promise<number>;

async function fetchQuickPrice(
  symbol: string,
  explicitType?: AssetType,
): Promise<Record<string, unknown>> {
  const assetType = explicitType || detectAssetType(symbol);
  if (assetType === "fx") {
    const data = await new FX(symbol).current;
    return {
      symbol,
      type: "fx",
      last: data.last,
      change: data.change ?? null,
      changePct: data.changePercent ?? null,
    };
  }
  if (assetType === "crypto") {
    const data = await new Crypto(symbol).current;
    return {
      symbol: symbol.toUpperCase(),
      type: "crypto",
      last: data.last,
      change: data.change ?? null,
      changePct: data.changePercent ?? null,
    };
  }
  if (assetType === "fund") {
    const data = await new Fund(symbol).info;
    return {
      symbol: data.fund_code,
      type: "fund",
      last: data.price,
      change: null,
      changePct: data.daily_return ?? null,
    };
  }
  if (assetType === "index") {
    const data = await new Index(symbol).info;
    return {
      symbol: data.symbol,
      type: "index",
      last: data.value,
      change: data.change ?? null,
      changePct: data.changePercent ?? null,
    };
  }
  const fi = new Ticker(symbol).fastInfo;
  const [last, prev, volume] = await Promise.all([
    fi.lastPrice,
    fi.previousClose,
    fi.volume,
  ]);
  const change = last && prev ? Number((last - prev).toFixed(2)) : null;
  const changePct =
    change !== null && prev ? Number(((change / prev) * 100).toFixed(2)) : null;
  return {
    symbol: symbol.toUpperCase(),
    type: "stock",
    last,
    change,
    changePct,
    volume,
  };
}

export const CLI_COMMANDS: Record<
  string,
  { description: string; handler: CommandHandler }
> = {
  auth: {
    description: "Manage TradingView authentication (login | logout | status)",
    handler: async (argv, io) => {
      const { positional, flags } = parseCliArgs(argv);
      const sub = (positional[0] || "status").toLowerCase();
      if (sub === "login") {
        const username = getStringFlag(flags, "username", "u");
        const password = getStringFlag(flags, "password", "p");
        const session = getStringFlag(flags, "session", "s");
        const sessionSign = getStringFlag(flags, "session-sign");
        const creds = await setTradingViewAuth({
          username,
          password,
          session,
          sessionSign,
        });
        io.stdout(
          `Logged in to TradingView${creds?.user?.username ? ` as ${creds.user.username}` : ""}.`,
        );
        return 0;
      }
      if (sub === "logout") {
        clearTradingViewAuth();
        io.stdout("Logged out from TradingView.");
        return 0;
      }
      if (sub === "status") {
        const creds = getTradingViewAuth();
        io.stdout(
          creds
            ? `Authenticated (session active${creds.user?.username ? `, user: ${creds.user.username}` : ""}).`
            : "Not authenticated.",
        );
        return 0;
      }
      io.stderr(
        `Unknown auth subcommand: ${sub}. Use login, logout, or status.`,
      );
      return 1;
    },
  },

  price: {
    description: "Quick price lookup for one or more symbols",
    handler: async (argv, io) => {
      const { positional, flags } = parseCliArgs(argv);
      if (positional.length === 0) {
        io.stderr(
          "Usage: borsats price <SYMBOL...> [--type stock|fx|crypto|fund|index] [--output table|json|csv]",
        );
        return 1;
      }
      const assetType = getStringFlag(flags, "type", "t") as
        AssetType | undefined;
      const fmt = getOutputFormat(flags);
      const rows = await Promise.all(
        positional.map((s) => fetchQuickPrice(s, assetType)),
      );
      io.stdout(formatOutput(rows, fmt));
      return 0;
    },
  },

  quote: {
    description: "Get detailed quote information for a symbol",
    handler: async (argv, io) => {
      const { positional, flags } = parseCliArgs(argv);
      const symbol = positional[0];
      if (!symbol) {
        io.stderr(
          "Usage: borsats quote <SYMBOL> [--type stock|fx|crypto|fund|index] [--output table|json|csv]",
        );
        return 1;
      }
      const assetType =
        (getStringFlag(flags, "type", "t") as AssetType | undefined) ||
        detectAssetType(symbol);
      const fmt = getOutputFormat(flags);
      let data: unknown;
      if (assetType === "fx") data = await new FX(symbol).info;
      else if (assetType === "crypto") data = await new Crypto(symbol).info;
      else if (assetType === "fund") data = await new Fund(symbol).info;
      else if (assetType === "index") data = await new Index(symbol).info;
      else data = await new Ticker(symbol).info();
      io.stdout(formatOutput(data, fmt));
      return 0;
    },
  },

  search: {
    description: "Search for symbols by name or keyword",
    handler: async (argv, io) => {
      const { positional, flags } = parseCliArgs(argv);
      const query = positional[0];
      if (!query) {
        io.stderr(
          "Usage: borsats search <QUERY> [--type ...] [--exchange ...] [--limit N]",
        );
        return 1;
      }
      const results = await search(query, {
        type: getStringFlag(flags, "type", "t"),
        exchange: getStringFlag(flags, "exchange", "e"),
        limit: getNumberFlag(flags, "limit", "l") ?? 20,
        fullInfo: true,
      });
      io.stdout(formatOutput(results, getOutputFormat(flags)));
      return 0;
    },
  },

  history: {
    description: "Get historical OHLCV data for a symbol",
    handler: async (argv, io) => {
      const { positional, flags } = parseCliArgs(
        argv,
        new Set(["actions", "a"]),
      );
      const symbol = positional[0];
      if (!symbol) {
        io.stderr(
          "Usage: borsats history <SYMBOL> [--period 1mo] [--interval 1d] [--actions]",
        );
        return 1;
      }
      const period = (getStringFlag(flags, "period", "p") || "1mo") as Period;
      const interval = (getStringFlag(flags, "interval", "i") ||
        "1d") as Interval;
      const assetType =
        (getStringFlag(flags, "type", "t") as AssetType | undefined) ||
        detectAssetType(symbol);
      const actions = getBoolFlag(flags, "actions", "a");
      let data: unknown;
      if (assetType === "fx") {
        data = await new FX(symbol).history({ period, interval });
      } else if (assetType === "crypto") {
        data = await new Crypto(symbol).history({ period, interval });
      } else if (assetType === "fund") {
        data = await new Fund(symbol).history({ period });
      } else if (assetType === "index") {
        data = await new Index(symbol).history({ period, interval });
      } else {
        data = await new Ticker(symbol).history({ period, interval, actions });
      }
      io.stdout(formatOutput(data, getOutputFormat(flags)));
      return 0;
    },
  },

  scan: {
    description: "Scan BIST stocks matching technical conditions",
    handler: async (argv, io) => {
      const { positional, flags } = parseCliArgs(argv);
      const condition = positional[0];
      if (!condition) {
        io.stderr(
          "Usage: borsats scan '<CONDITION>' [--index XU030] [--interval 1d] [--limit 50]",
        );
        return 1;
      }
      const index = getStringFlag(flags, "index", "x") || "XU030";
      const interval = (getStringFlag(flags, "interval", "i") ||
        "1d") as Interval;
      const limit = getNumberFlag(flags, "limit", "l") ?? 50;
      const results = await scan(index, condition, interval, limit);
      const rows = results.map((r) => ({ symbol: r.symbol, ...r.data }));
      io.stdout(formatOutput(rows, getOutputFormat(flags)));
      return 0;
    },
  },

  screen: {
    description: "Screen BIST stocks based on fundamental criteria",
    handler: async (argv, io) => {
      const { flags } = parseCliArgs(argv);
      const limit = getNumberFlag(flags, "limit", "l");
      const results = await screenStocks({
        template: getStringFlag(flags, "template"),
        sector: getStringFlag(flags, "sector", "s"),
        index: getStringFlag(flags, "index", "x"),
        recommendation: getStringFlag(flags, "rec", "r"),
        market_cap_min: getNumberFlag(flags, "mcap-min"),
        market_cap_max: getNumberFlag(flags, "mcap-max"),
        pe_min: getNumberFlag(flags, "pe-min"),
        pe_max: getNumberFlag(flags, "pe-max"),
        pb_min: getNumberFlag(flags, "pb-min"),
        pb_max: getNumberFlag(flags, "pb-max"),
        dividend_yield_min: getNumberFlag(flags, "div-min"),
        roe_min: getNumberFlag(flags, "roe-min"),
        upside_potential_min: getNumberFlag(flags, "upside-min"),
        foreign_ratio_min: getNumberFlag(flags, "foreign-min"),
      });
      const sliced = limit ? results.slice(0, limit) : results;
      io.stdout(formatOutput(sliced, getOutputFormat(flags)));
      return 0;
    },
  },

  technical: {
    description: "Display technical indicators for a symbol",
    handler: async (argv, io) => {
      const { positional, flags } = parseCliArgs(argv);
      const symbol = positional[0];
      if (!symbol) {
        io.stderr(
          "Usage: borsats technical <SYMBOL> [--period 3mo] [--indicator rsi]",
        );
        return 1;
      }
      const period = (getStringFlag(flags, "period", "p") || "3mo") as Period;
      const requested = getListFlag(flags, "indicator", "i").map((x) =>
        x.toLowerCase(),
      );
      const assetType =
        (getStringFlag(flags, "type", "t") as AssetType | undefined) ||
        detectAssetType(symbol);

      const analyzer =
        assetType === "fx"
          ? await new FX(symbol).technicals(period)
          : assetType === "crypto"
            ? await new Crypto(symbol).technicals(period)
            : assetType === "fund"
              ? await new Fund(symbol).technicals(period)
              : assetType === "index"
                ? await new Index(symbol).technicals(period)
                : await new Ticker(symbol).technicals(period);

      const latest = analyzer.latest;
      const filtered =
        requested.length > 0
          ? Object.fromEntries(
              Object.entries(latest).filter(([k]) =>
                requested.some((req) => k.toLowerCase().includes(req)),
              ),
            )
          : latest;
      io.stdout(formatOutput(filtered, getOutputFormat(flags)));
      return 0;
    },
  },

  compare: {
    description: "Compare multiple tickers side by side",
    handler: async (argv, io) => {
      const { positional, flags } = parseCliArgs(argv);
      if (positional.length < 2) {
        io.stderr(
          "Usage: borsats compare <SYMBOL1> <SYMBOL2> [...] [--type stock|fx|crypto|fund|index]",
        );
        return 1;
      }
      const assetType = getStringFlag(flags, "type", "t") as
        AssetType | undefined;
      const rows = await Promise.all(
        positional.map((s) => fetchQuickPrice(s, assetType)),
      );
      io.stdout(formatOutput(rows, getOutputFormat(flags)));
      return 0;
    },
  },

  watch: {
    description: "Watch real-time prices using TradingView WebSocket streaming",
    handler: async (argv, io) => {
      const { positional, flags } = parseCliArgs(argv);
      if (positional.length === 0) {
        io.stderr(
          "Usage: borsats watch <SYMBOL...> [--duration 10] [--output table|json|csv]",
        );
        return 1;
      }
      const durationSec = getNumberFlag(flags, "duration", "d") ?? 5;
      const fmt = getOutputFormat(flags);
      const stream = createStream();
      await stream.connect();
      try {
        stream.subscribeMultiple(positional);
        await new Promise((r) => setTimeout(r, durationSec * 1000));
        const quotes = Object.values(stream.getAllQuotes());
        io.stdout(formatOutput(quotes, fmt));
      } finally {
        stream.disconnect();
      }
      return 0;
    },
  },

  economic: {
    description: "Display economic calendar events",
    handler: async (argv, io) => {
      const { flags } = parseCliArgs(argv);
      const cal = new EconomicCalendar();
      const events = await cal.events({
        period: getStringFlag(flags, "period", "p") || "1w",
        country: getStringFlag(flags, "country", "c"),
        importance: getStringFlag(flags, "importance", "i") as
          "high" | "mid" | "low" | undefined,
      });
      io.stdout(formatOutput(events, getOutputFormat(flags)));
      return 0;
    },
  },

  news: {
    description: "Get KAP disclosures (news) for a stock",
    handler: async (argv, io) => {
      const { positional, flags } = parseCliArgs(argv);
      const symbol = positional[0];
      if (!symbol) {
        io.stderr("Usage: borsats news <SYMBOL> [--limit 10]");
        return 1;
      }
      const limit = getNumberFlag(flags, "limit", "l") ?? 10;
      const items = await new Ticker(symbol).news;
      io.stdout(formatOutput(items.slice(0, limit), getOutputFormat(flags)));
      return 0;
    },
  },

  dividends: {
    description: "Get dividend history for a stock",
    handler: async (argv, io) => {
      const { positional, flags } = parseCliArgs(argv);
      const symbol = positional[0];
      if (!symbol) {
        io.stderr("Usage: borsats dividends <SYMBOL>");
        return 1;
      }
      const data = await new Ticker(symbol).dividends;
      io.stdout(formatOutput(data, getOutputFormat(flags)));
      return 0;
    },
  },

  splits: {
    description: "Get capital increases (stock splits) for a stock",
    handler: async (argv, io) => {
      const { positional, flags } = parseCliArgs(argv);
      const symbol = positional[0];
      if (!symbol) {
        io.stderr("Usage: borsats splits <SYMBOL>");
        return 1;
      }
      const data = await new Ticker(symbol).splits;
      io.stdout(formatOutput(data, getOutputFormat(flags)));
      return 0;
    },
  },

  companies: {
    description: "List all BIST companies or search by name/ticker",
    handler: async (argv, io) => {
      const { flags } = parseCliArgs(argv);
      const query = getStringFlag(flags, "search", "s");
      const data = query ? await searchCompanies(query) : await companies();
      io.stdout(formatOutput(data, getOutputFormat(flags)));
      return 0;
    },
  },

  bonds: {
    description: "Get Turkish government bond yields",
    handler: async (argv, io) => {
      const { positional, flags } = parseCliArgs(
        argv,
        new Set(["risk-free", "r"]),
      );
      const fmt = getOutputFormat(flags);
      if (getBoolFlag(flags, "risk-free", "r")) {
        const rate = await riskFreeRate();
        io.stdout(formatOutput({ riskFreeRate: rate }, fmt));
        return 0;
      }
      const maturity = positional[0];
      const data = maturity
        ? await new Bond(maturity as "2Y" | "5Y" | "10Y").info
        : await bonds();
      io.stdout(formatOutput(data, fmt));
      return 0;
    },
  },

  tcmb: {
    description: "Get TCMB (Turkish Central Bank) interest rates",
    handler: async (argv, io) => {
      const { flags } = parseCliArgs(argv, new Set(["history"]));
      const tcmb = new TCMB();
      const fmt = getOutputFormat(flags);
      const rateType = (getStringFlag(flags, "type", "t") || "policy") as
        "policy" | "overnight" | "late_liquidity";
      if (getBoolFlag(flags, "history")) {
        const period = getStringFlag(flags, "period", "p");
        const data = await tcmb.history(rateType, period);
        io.stdout(formatOutput(data, fmt));
        return 0;
      }
      const data = await tcmb.rates;
      io.stdout(formatOutput(data, fmt));
      return 0;
    },
  },

  inflation: {
    description: "Get inflation data or calculate inflation-adjusted values",
    handler: async (argv, io) => {
      const { positional, flags } = parseCliArgs(argv, new Set(["history"]));
      const inf = new Inflation();
      const fmt = getOutputFormat(flags);
      const infType = (getStringFlag(flags, "type", "t") || "tufe") as
        "tufe" | "ufe";

      if (positional[0]) {
        const amount = Number(positional[0]);
        const start = getStringFlag(flags, "start", "s");
        const end = getStringFlag(flags, "end", "e");
        if (isNaN(amount) || !start || !end) {
          io.stderr(
            "Usage: borsats inflation <AMOUNT> --start YYYY-MM --end YYYY-MM",
          );
          return 1;
        }
        const calc = await inf.calculate(amount, start, end);
        io.stdout(formatOutput(calc, fmt));
        return 0;
      }

      if (getBoolFlag(flags, "history")) {
        const limit = getNumberFlag(flags, "limit", "l");
        const data =
          infType === "ufe"
            ? await inf.ufe({ limit })
            : await inf.tufe({ limit });
        io.stdout(formatOutput(data, fmt));
        return 0;
      }

      const latest = await inf.latest(infType);
      io.stdout(formatOutput(latest, fmt));
      return 0;
    },
  },

  fund: {
    description: "Get mutual fund data from TEFAS",
    handler: async (argv, io) => {
      const { positional, flags } = parseCliArgs(
        argv,
        new Set(["allocation", "a", "holdings", "risk", "r", "screen"]),
      );
      const fmt = getOutputFormat(flags);

      const compareList = getListFlag(flags, "compare", "c");
      if (compareList.length > 0) {
        const res = await compareFunds(compareList);
        io.stdout(formatOutput(res.funds, fmt));
        return 0;
      }

      if (getBoolFlag(flags, "screen")) {
        const res = await screenFunds({
          fundType: (getStringFlag(flags, "type", "t") || "YAT") as
            "YAT" | "EMK" | "BYF",
          minReturn1y: getNumberFlag(flags, "min-return-1y"),
          minReturnYtd: getNumberFlag(flags, "min-return-ytd"),
          limit: getNumberFlag(flags, "limit", "l") ?? 20,
        });
        io.stdout(formatOutput(res, fmt));
        return 0;
      }

      const code = positional[0];
      if (!code) {
        io.stderr(
          "Usage: borsats fund <CODE> [--allocation|--holdings --api-key KEY|--risk|--screen|--compare A --compare B]",
        );
        return 1;
      }
      const fund = new Fund(code);

      if (getBoolFlag(flags, "allocation", "a")) {
        io.stdout(formatOutput(await fund.allocation, fmt));
        return 0;
      }
      if (getBoolFlag(flags, "holdings")) {
        const apiKey =
          getStringFlag(flags, "api-key") || process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
          io.stderr(
            "OpenRouter API key required: pass --api-key or set OPENROUTER_API_KEY.",
          );
          return 1;
        }
        io.stdout(formatOutput(await fund.getHoldings(apiKey), fmt));
        return 0;
      }
      if (getBoolFlag(flags, "risk", "r")) {
        io.stdout(formatOutput(await fund.riskMetrics(), fmt));
        return 0;
      }

      io.stdout(formatOutput(await fund.info, fmt));
      return 0;
    },
  },

  eurobond: {
    description: "Get Turkish sovereign Eurobond data",
    handler: async (argv, io) => {
      const { positional, flags } = parseCliArgs(argv);
      const isin = positional[0];
      const currency = getStringFlag(flags, "currency");
      const data = isin
        ? await new Eurobond(isin).info()
        : await eurobonds(currency);
      io.stdout(formatOutput(data, getOutputFormat(flags)));
      return 0;
    },
  },

  index: {
    description: "Get BIST market index data and components",
    handler: async (argv, io) => {
      const { positional, flags } = parseCliArgs(
        argv,
        new Set(["symbols", "s", "list", "l", "all", "a"]),
      );
      const fmt = getOutputFormat(flags);
      if (getBoolFlag(flags, "all", "a")) {
        io.stdout(formatOutput(await allIndices(), fmt));
        return 0;
      }
      if (getBoolFlag(flags, "list", "l")) {
        io.stdout(formatOutput(await indices(true), fmt));
        return 0;
      }
      const sym = positional[0];
      if (!sym) {
        io.stderr("Usage: borsats index <SYMBOL> [--symbols] | --list | --all");
        return 1;
      }
      const idx = new Index(sym);
      if (getBoolFlag(flags, "symbols", "s")) {
        io.stdout(formatOutput(await idx.componentSymbols(), fmt));
        return 0;
      }
      io.stdout(formatOutput(await idx.components, fmt));
      return 0;
    },
  },

  financials: {
    description: "Get company financial statements",
    handler: async (argv, io) => {
      const { positional, flags } = parseCliArgs(
        argv,
        new Set([
          "balance",
          "b",
          "income",
          "i",
          "cashflow",
          "c",
          "quarterly",
          "q",
          "ttm",
          "t",
        ]),
      );
      const symbol = positional[0];
      if (!symbol) {
        io.stderr(
          "Usage: borsats financials <SYMBOL> [--balance|--income|--cashflow] [--quarterly] [--ttm]",
        );
        return 1;
      }
      const ticker = new Ticker(symbol);
      const quarterly = getBoolFlag(flags, "quarterly", "q");
      const ttm = getBoolFlag(flags, "ttm", "t");
      const financialGroup = getStringFlag(flags, "group", "g");
      const lastN = getNumberFlag(flags, "limit", "n");

      let data: unknown;
      if (getBoolFlag(flags, "balance", "b")) {
        data = await ticker.getBalanceSheet({
          quarterly,
          financialGroup,
          lastN,
        });
      } else if (getBoolFlag(flags, "cashflow", "c")) {
        data = ttm
          ? await ticker.getTTMCashflow(financialGroup)
          : await ticker.getCashflow({ quarterly, financialGroup, lastN });
      } else {
        data = ttm
          ? await ticker.getTTMIncomeStmt(financialGroup)
          : await ticker.getIncomeStmt({ quarterly, financialGroup, lastN });
      }
      io.stdout(formatOutput(data, getOutputFormat(flags)));
      return 0;
    },
  },

  signals: {
    description: "Get TradingView technical analysis signals",
    handler: async (argv, io) => {
      const { positional, flags } = parseCliArgs(
        argv,
        new Set(["all", "a", "detail", "d"]),
      );
      const symbol = positional[0];
      if (!symbol) {
        io.stderr(
          "Usage: borsats signals <SYMBOL> [--interval 1d] [--all] [--detail]",
        );
        return 1;
      }
      const interval = (getStringFlag(flags, "interval", "i") ||
        "1d") as Interval;
      const allTf = getBoolFlag(flags, "all", "a");
      const assetType =
        (getStringFlag(flags, "type", "t") as AssetType | undefined) ||
        detectAssetType(symbol);

      let data: unknown;
      if (assetType === "fx") {
        const fx = new FX(symbol);
        data = allTf
          ? await fx.taSignalsAllTimeframes()
          : await fx.taSignals(interval);
      } else if (assetType === "crypto") {
        const c = new Crypto(symbol);
        data = allTf
          ? await c.taSignalsAllTimeframes()
          : await c.taSignals(interval);
      } else if (assetType === "index") {
        const idx = new Index(symbol);
        data = allTf
          ? await idx.taSignalsAllTimeframes()
          : await idx.taSignals(interval);
      } else {
        const tk = new Ticker(symbol);
        data = allTf
          ? await tk.taSignalsAllTimeframes()
          : await tk.taSignals(interval);
      }
      io.stdout(formatOutput(data, getOutputFormat(flags)));
      return 0;
    },
  },

  holders: {
    description: "Get major shareholders or ETF holders for a stock",
    handler: async (argv, io) => {
      const { positional, flags } = parseCliArgs(argv, new Set(["etf", "e"]));
      const symbol = positional[0];
      if (!symbol) {
        io.stderr("Usage: borsats holders <SYMBOL> [--etf] [--limit N]");
        return 1;
      }
      const ticker = new Ticker(symbol);
      const limit = getNumberFlag(flags, "limit", "n");
      const rows = getBoolFlag(flags, "etf", "e")
        ? await ticker.etfHolders
        : await ticker.majorHolders;
      const sliced = limit ? rows.slice(0, limit) : rows;
      io.stdout(formatOutput(sliced, getOutputFormat(flags)));
      return 0;
    },
  },

  targets: {
    description: "Get analyst price targets and recommendations for a stock",
    handler: async (argv, io) => {
      const { positional, flags } = parseCliArgs(
        argv,
        new Set(["recommendations", "r", "summary", "s"]),
      );
      const symbol = positional[0];
      if (!symbol) {
        io.stderr(
          "Usage: borsats targets <SYMBOL> [--recommendations] [--summary]",
        );
        return 1;
      }
      const ticker = new Ticker(symbol);
      const fmt = getOutputFormat(flags);
      if (getBoolFlag(flags, "recommendations", "r")) {
        io.stdout(formatOutput(await ticker.recommendations, fmt));
        return 0;
      }
      if (getBoolFlag(flags, "summary", "s")) {
        io.stdout(formatOutput(await ticker.recommendationsSummary, fmt));
        return 0;
      }
      io.stdout(formatOutput(await ticker.analystPriceTargets, fmt));
      return 0;
    },
  },

  "fx-rates": {
    description: "Get bank and institution rates for currencies and metals",
    handler: async (argv, io) => {
      const { positional, flags } = parseCliArgs(
        argv,
        new Set(["banks", "institutions"]),
      );
      const fmt = getOutputFormat(flags);
      if (getBoolFlag(flags, "banks")) {
        io.stdout(formatOutput(await banks(), fmt));
        return 0;
      }
      if (getBoolFlag(flags, "institutions")) {
        io.stdout(formatOutput(await metalInstitutions(), fmt));
        return 0;
      }
      const symbol = positional[0];
      if (!symbol) {
        io.stderr(
          "Usage: borsats fx-rates <SYMBOL> [--bank akbank | --institution ...] | --banks | --institutions",
        );
        return 1;
      }
      const fx = new FX(symbol);
      const bank = getStringFlag(flags, "bank", "b");
      const inst = getStringFlag(flags, "institution", "i");
      if (bank) {
        io.stdout(formatOutput(await fx.bankRate(bank), fmt));
        return 0;
      }
      if (inst) {
        io.stdout(formatOutput(await fx.institutionRate(inst), fmt));
        return 0;
      }
      if (symbol.includes("-")) {
        io.stdout(formatOutput(await fx.institutionRates(), fmt));
        return 0;
      }
      io.stdout(formatOutput(await fx.bankRates, fmt));
      return 0;
    },
  },

  viop: {
    description: "Get VIOP (Turkish derivatives) contract information",
    handler: async (argv, io) => {
      const { positional, flags } = parseCliArgs(
        argv,
        new Set(["detail", "d"]),
      );
      const fmt = getOutputFormat(flags);
      const baseSymbol = positional[0];
      const searchQuery = getStringFlag(flags, "search", "s");
      if (baseSymbol) {
        const contracts = await viopContracts(
          baseSymbol,
          getBoolFlag(flags, "detail", "d"),
        );
        io.stdout(formatOutput(contracts, fmt));
        return 0;
      }
      const v = new VIOP();
      const data = searchQuery
        ? await v.getBySymbol(searchQuery)
        : await v.futures;
      io.stdout(formatOutput(data, fmt));
      return 0;
    },
  },
};
