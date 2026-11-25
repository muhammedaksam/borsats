import { Index } from "~/bist-index";
import * as bistIndexModule from "~/bist-index";
import * as bondModule from "~/bond";
import { EconomicCalendar } from "~/calendar";
import { CLI_COMMANDS } from "~/cli/commands";
import {
  formatCSV,
  formatJSON,
  formatOutput,
  formatTable,
} from "~/cli/formatters";
import { CLI_VERSION, formatHelpText, runCli } from "~/cli/index";
import {
  detectAssetType,
  getBoolFlag,
  getListFlag,
  getNumberFlag,
  getOutputFormat,
  getStringFlag,
  parseCliArgs,
} from "~/cli/utils";
import { Crypto } from "~/crypto";
import * as eurobondModule from "~/eurobond";
import * as fundModule from "~/fund";
import { Fund } from "~/fund";
import * as fxModule from "~/fx";
import { FX } from "~/fx";
import { Inflation } from "~/inflation";
import * as marketModule from "~/market";
import * as tvProviderModule from "~/providers/tradingview";
import * as scannerModule from "~/scanner";
import * as screenerModule from "~/screener";
import * as searchModule from "~/search";
import * as streamModule from "~/stream";
import { TCMB } from "~/tcmb";
import { TechnicalAnalyzer } from "~/technical";
import { FastInfo, Ticker } from "~/ticker";
import { VIOP } from "~/viop";

function makeIO() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: {
      stdout: (s: string) => out.push(s),
      stderr: (s: string) => err.push(s),
    },
  };
}

describe("borsats CLI", () => {
  afterEach(() => {
    tvProviderModule.clearTradingViewAuth();
    jest.restoreAllMocks();
  });

  describe("Formatters & Utils", () => {
    test("formatTable, formatCSV, formatJSON, formatOutput", () => {
      const rows = [
        { symbol: "THYAO", price: 300.5, date: new Date("2025-01-10") },
        { symbol: "GARAN", price: 120, note: 'a, "b"' },
      ];
      expect(formatTable(rows)).toContain("THYAO");
      expect(formatTable([])).toBe("No data found.");
      expect(formatCSV(rows)).toContain('"a, ""b"""');
      expect(formatCSV([])).toBe("");
      expect(formatJSON({ a: 1 })).toContain('"a": 1');
      expect(formatOutput(rows, "json")).toContain("THYAO");
      expect(formatOutput(rows, "csv")).toContain("symbol,price");
      expect(formatOutput({ k: "v" }, "table")).toContain("field");
      expect(formatOutput(["A", "B"], "table")).toContain("value");
      expect(formatOutput("plain", "table")).toBe("plain");
    });

    test("detectAssetType & parseCliArgs helpers", () => {
      expect(detectAssetType("USD")).toBe("fx");
      expect(detectAssetType("gram-altin")).toBe("fx");
      expect(detectAssetType("BTCTRY")).toBe("crypto");
      expect(detectAssetType("XU100")).toBe("index");
      expect(detectAssetType("AAK")).toBe("fund");
      expect(detectAssetType("THYAO")).toBe("stock");

      const parsed = parseCliArgs([
        "THYAO",
        "--period=3mo",
        "-o",
        "json",
        "--indicator",
        "rsi",
        "--indicator",
        "macd",
        "--limit",
        "10",
        "--actions",
      ]);
      expect(parsed.positional).toEqual(["THYAO"]);
      expect(getStringFlag(parsed.flags, "period")).toBe("3mo");
      expect(getOutputFormat(parsed.flags)).toBe("json");
      expect(getListFlag(parsed.flags, "indicator")).toEqual(["rsi", "macd"]);
      expect(getNumberFlag(parsed.flags, "limit")).toBe(10);
      expect(getBoolFlag(parsed.flags, "actions")).toBe(true);
    });
  });

  describe("Global CLI flags & dispatch", () => {
    test("supports all 27 borsapy commands, --help, --version, and unknown command error", async () => {
      expect(Object.keys(CLI_COMMANDS)).toHaveLength(27);
      expect(formatHelpText()).toContain("borsats " + CLI_VERSION);

      const h = makeIO();
      expect(await runCli(["--help"], h.io)).toBe(0);
      expect(h.out[0]).toContain("Commands:");

      const v = makeIO();
      expect(await runCli(["--version"], v.io)).toBe(0);
      expect(v.out[0]).toBe(`borsats ${CLI_VERSION}`);

      const subHelp = makeIO();
      expect(await runCli(["price", "--help"], subHelp.io)).toBe(0);
      expect(subHelp.out[0]).toContain("borsats price");

      const unk = makeIO();
      expect(await runCli(["does-not-exist"], unk.io)).toBe(1);
      expect(unk.err[0]).toContain("Unknown command");
    });
  });

  describe("All 27 commands (mocked providers)", () => {
    test("auth login / status / logout", async () => {
      jest.spyOn(tvProviderModule, "setTradingViewAuth").mockResolvedValueOnce({
        session: "s",
        authToken: "t",
        user: { username: "alice" },
      });

      const io1 = makeIO();
      expect(await runCli(["auth", "login", "--session", "s"], io1.io)).toBe(0);
      expect(io1.out[0]).toContain("alice");

      const io2 = makeIO();
      expect(await runCli(["auth", "status"], io2.io)).toBe(0);

      const io3 = makeIO();
      expect(await runCli(["auth", "logout"], io3.io)).toBe(0);
      expect(io3.out[0]).toContain("Logged out");
    });

    test("price, quote, compare", async () => {
      jest.spyOn(Ticker.prototype, "fastInfo", "get").mockReturnValue({
        lastPrice: Promise.resolve(300),
        previousClose: Promise.resolve(295),
        volume: Promise.resolve(1000000),
      } as unknown as FastInfo);
      jest
        .spyOn(Ticker.prototype, "info")
        .mockResolvedValue({ symbol: "THYAO", last: 300 });
      jest
        .spyOn(FX.prototype, "current", "get")
        .mockResolvedValue({ symbol: "USD", last: 35.2 });
      jest
        .spyOn(Crypto.prototype, "current", "get")
        .mockResolvedValue({ symbol: "BTCTRY", last: 3200000 });
      jest
        .spyOn(Fund.prototype, "info", "get")
        .mockResolvedValue({
          fund_code: "AAK",
          price: 12.5,
          daily_return: 0.4,
        } as Awaited<Fund["info"]>);
      jest
        .spyOn(Index.prototype, "info", "get")
        .mockResolvedValue({
          symbol: "XU100",
          name: "BIST 100",
          value: 10000,
        } as Awaited<Index["info"]>);

      const p = makeIO();
      expect(
        await runCli(
          ["price", "THYAO", "USD", "BTCTRY", "AAK", "XU100", "-o", "json"],
          p.io,
        ),
      ).toBe(0);
      expect(JSON.parse(p.out[0])).toHaveLength(5);

      const q = makeIO();
      expect(await runCli(["quote", "THYAO", "-o", "json"], q.io)).toBe(0);
      expect(JSON.parse(q.out[0]).last).toBe(300);

      const cmp = makeIO();
      expect(await runCli(["compare", "THYAO", "GARAN"], cmp.io)).toBe(0);
      expect(cmp.out[0]).toContain("THYAO");
    });

    test("search, history, scan, screen, technical, signals", async () => {
      jest.spyOn(searchModule, "search").mockResolvedValueOnce([
        {
          symbol: "THYAO",
          fullName: "BIST:THYAO",
          description: "THY",
          type: "stock",
          exchange: "BIST",
          currency: "TRY",
          country: "TR",
        },
      ]);
      const s = makeIO();
      expect(await runCli(["search", "THY", "-o", "json"], s.io)).toBe(0);
      expect(JSON.parse(s.out[0])[0].symbol).toBe("THYAO");

      jest.spyOn(Ticker.prototype, "history").mockResolvedValue([
        {
          date: new Date("2025-01-10"),
          open: 100,
          high: 105,
          low: 99,
          close: 104,
          volume: 1000,
        },
      ]);
      const h = makeIO();
      expect(
        await runCli(["history", "THYAO", "-p", "5d", "-o", "csv"], h.io),
      ).toBe(0);
      expect(h.out[0]).toContain("close");

      jest.spyOn(scannerModule, "scan").mockResolvedValueOnce([
        {
          symbol: "THYAO",
          data: { rsi: 25 },
          conditionsMet: ["rsi < 30"],
          timestamp: new Date(),
        },
      ]);
      const sc = makeIO();
      expect(
        await runCli(["scan", "rsi < 30", "--index", "XU030"], sc.io),
      ).toBe(0);
      expect(sc.out[0]).toContain("THYAO");

      jest.spyOn(screenerModule, "screenStocks").mockResolvedValueOnce([
        { symbol: "GARAN", name: "Garanti" },
      ]);
      const scr = makeIO();
      expect(
        await runCli(["screen", "--template", "high_dividend", "-l", "5"], scr.io),
      ).toBe(0);
      expect(scr.out[0]).toContain("GARAN");

      jest.spyOn(Ticker.prototype, "technicals").mockResolvedValueOnce(
        new TechnicalAnalyzer([
          {
            date: new Date("2025-01-10"),
            open: 100,
            high: 105,
            low: 99,
            close: 104,
            volume: 1000,
          },
        ]),
      );
      const t = makeIO();
      expect(
        await runCli(["technical", "THYAO", "-i", "rsi", "-o", "json"], t.io),
      ).toBe(0);

      jest.spyOn(Ticker.prototype, "taSignals").mockResolvedValueOnce({
        symbol: "BIST:THYAO",
        exchange: "BIST",
        interval: "1d",
        summary: { recommendation: "BUY", buy: 10, sell: 2, neutral: 4 },
        oscillators: {
          recommendation: "BUY",
          buy: 5,
          sell: 1,
          neutral: 2,
          values: {},
        },
        moving_averages: {
          recommendation: "BUY",
          buy: 5,
          sell: 1,
          neutral: 2,
          values: {},
        },
      });
      const sig = makeIO();
      expect(await runCli(["signals", "THYAO", "-o", "json"], sig.io)).toBe(0);
    });

    test("watch, economic, news, dividends, splits, companies, holders, targets, financials", async () => {
      jest.spyOn(streamModule, "createStream").mockReturnValueOnce({
        connect: jest.fn().mockResolvedValue(undefined),
        subscribeMultiple: jest.fn(),
        getAllQuotes: jest
          .fn()
          .mockReturnValue({ "BIST:THYAO": { symbol: "BIST:THYAO", lp: 300 } }),
        disconnect: jest.fn(),
      } as unknown as ReturnType<typeof streamModule.createStream>);
      const w = makeIO();
      expect(
        await runCli(["watch", "THYAO", "-d", "0", "-o", "json"], w.io),
      ).toBe(0);
      expect(JSON.parse(w.out[0])[0].lp).toBe(300);

      jest
        .spyOn(EconomicCalendar.prototype, "events")
        .mockResolvedValueOnce([]);
      expect(await runCli(["economic", "-c", "TR"], makeIO().io)).toBe(0);

      jest
        .spyOn(Ticker.prototype, "news", "get")
        .mockResolvedValueOnce([
          { date: new Date(), title: "KAP Disclosure", url: "https://kap.org.tr" },
        ]);
      expect(await runCli(["news", "THYAO"], makeIO().io)).toBe(0);

      jest
        .spyOn(Ticker.prototype, "dividends", "get")
        .mockResolvedValueOnce([{ date: new Date(), dividend: 5 }]);
      expect(await runCli(["dividends", "THYAO"], makeIO().io)).toBe(0);

      jest
        .spyOn(Ticker.prototype, "splits", "get")
        .mockResolvedValueOnce([]);
      expect(await runCli(["splits", "THYAO"], makeIO().io)).toBe(0);

      jest
        .spyOn(marketModule, "companies")
        .mockResolvedValueOnce([{ ticker: "THYAO", name: "THY", city: "IST" }]);
      expect(await runCli(["companies"], makeIO().io)).toBe(0);

      jest
        .spyOn(Ticker.prototype, "majorHolders", "get")
        .mockResolvedValueOnce([{ name: "TVF", percentage: 49.12 }]);
      expect(await runCli(["holders", "THYAO"], makeIO().io)).toBe(0);

      jest
        .spyOn(Ticker.prototype, "analystPriceTargets", "get")
        .mockResolvedValueOnce({
          current: 300,
          mean: 400,
          high: 450,
          low: 350,
          numberOfAnalysts: 10,
        });
      expect(await runCli(["targets", "THYAO"], makeIO().io)).toBe(0);

      jest
        .spyOn(Ticker.prototype, "getIncomeStmt")
        .mockResolvedValueOnce({} as Awaited<ReturnType<Ticker["getIncomeStmt"]>>);
      expect(await runCli(["financials", "THYAO", "--income"], makeIO().io)).toBe(
        0,
      );
    });

    test("bonds, tcmb, inflation, fund, eurobond, index, fx-rates, viop", async () => {
      jest.spyOn(bondModule, "riskFreeRate").mockResolvedValueOnce(0.28);
      jest.spyOn(bondModule, "bonds").mockResolvedValueOnce([]);
      expect(await runCli(["bonds", "--risk-free"], makeIO().io)).toBe(0);
      expect(await runCli(["bonds"], makeIO().io)).toBe(0);

      jest.spyOn(TCMB.prototype, "rates", "get").mockResolvedValueOnce([]);
      expect(await runCli(["tcmb"], makeIO().io)).toBe(0);

      jest.spyOn(Inflation.prototype, "latest").mockResolvedValueOnce({
        year: 2025,
        month: 1,
        value: 2700,
        monthlyChange: 2,
        annualChange: 40,
      });
      expect(await runCli(["inflation"], makeIO().io)).toBe(0);

      jest
        .spyOn(Fund.prototype, "info", "get")
        .mockResolvedValueOnce({ fund_code: "AAK", price: 12 } as Awaited<
          Fund["info"]
        >);
      jest.spyOn(fundModule, "screenFunds").mockResolvedValueOnce([]);
      expect(await runCli(["fund", "AAK"], makeIO().io)).toBe(0);
      expect(await runCli(["fund", "--screen"], makeIO().io)).toBe(0);

      jest.spyOn(eurobondModule, "eurobonds").mockResolvedValueOnce([]);
      expect(await runCli(["eurobond"], makeIO().io)).toBe(0);

      jest
        .spyOn(bistIndexModule, "indices")
        .mockResolvedValueOnce([{ symbol: "XU100", name: "BIST 100", count: 100 }]);
      expect(await runCli(["index", "--list"], makeIO().io)).toBe(0);

      jest.spyOn(fxModule, "banks").mockReturnValueOnce(["akbank"]);
      expect(await runCli(["fx-rates", "--banks"], makeIO().io)).toBe(0);

      jest.spyOn(VIOP.prototype, "futures", "get").mockResolvedValueOnce([]);
      expect(await runCli(["viop"], makeIO().io)).toBe(0);
    });
  });
});
