# BorsaTS

[![npm version](https://img.shields.io/npm/v/@muhammedaksam/borsats)](https://www.npmjs.com/package/@muhammedaksam/borsats)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![CI](https://github.com/muhammedaksam/borsats/workflows/CI/badge.svg)](https://github.com/muhammedaksam/borsats/actions)
[![codecov](https://codecov.io/gh/muhammedaksam/borsats/branch/main/graph/badge.svg)](https://codecov.io/gh/muhammedaksam/borsats)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)

> **Disclaimer**
>
> This library is for personal and educational use only. It cannot be used for developing commercial software products, commercial services, or any commercial purposes. For commercial use, you must contact Borsa Istanbul to purchase an appropriate license.

Turkish financial markets data library and CLI for TypeScript/JavaScript. A yfinance-like API for BIST stocks, forex, crypto, investment & pension funds, bonds, Eurobonds, TCMB rates, EVDS macro data, technical analysis, scanning, backtesting, and real-time streaming.

**Aligned with [borsapy](https://github.com/saidsurucu/borsapy/) v0.11.0** — bringing full feature parity to the TypeScript ecosystem.

## Features

- 📈 **BIST Stocks (`Ticker`, `Tickers`, `download`)** — Quotes, OHLCV history (split-adjusted, unadjusted, and dividend-adjusted `adjClose`), parametric financial statements (`lastN`), TTM statements, dividends, splits, analyst recommendations & price targets, KAP disclosures, ETF holders, ISIN
- 💱 **65+ Currencies & Commodities (`FX`)** — Live rates, bank rates, precious metal dealer rates, institution history, intraday TradingView data
- 🪙 **Cryptocurrencies (`Crypto`)** — BtcTurk TRY/USDT pairs, quotes, OHLCV history, TradingView TA signals
- 🏦 **Investment, Pension & ETF Funds (`Fund`)** — TEFAS v2 JSON API (`YAT`, `EMK`, `BYF`), profile info, NAV history, portfolio asset allocation & allocation history, screening, comparison, management fees, risk metrics, withholding tax (stopaj) schedule, and KAP PDF holdings parsing via OpenRouter LLM
- 🏛️ **EVDS (`EVDS`, `EVDSSeries`)** — TCMB Electronic Data Delivery System (145 categories, series search, multi-series download, dashboards, formulas, automatic pagination)
- 📊 **79 BIST Indices (`Index`)** — Quotes, OHLCV history, constituent stocks, participation indices, index scanning
- 📉 **Technical Analysis (`TechnicalAnalyzer`, `TechnicalMixin`)** — SMA, EMA, WMA, DEMA, TEMA, Tilson T3, RSI, MACD, Bollinger Bands, ATR, Stochastic, OBV, VWAP, ADX, Supertrend, HHV, LLV, MOM, ROC, CCI, Williams %R, Pivot Points, Ichimoku, Heikin Ashi, and TradingView TA signals across all 6 asset classes
- 🔎 **Stock Screener & Technical Scanner (`Screener`, `TechnicalScanner`)** — Fundamental screening (İş Yatırım templates & criteria) and fast native TradingView technical scanning with parallel local calculation for Supertrend & Tilson T3
- 🧪 **Backtesting & Historical Replay (`BacktestEngine`, `ReplaySession`)** — Strategy backtesting with commissions, slippage, Sharpe/Sortino/Calmar ratios, drawdown curves, and candle-by-candle replay
- 💼 **Portfolio Management (`Portfolio`)** — Multi-asset holdings (`stock`, `fx`, `crypto`, `fund`), `purchaseDate` tracking, multi-asset history & correlation matrix, risk metrics (Sharpe, Sortino, Beta, Alpha), drift analysis, and automated rebalancing
- ⚡ **Real-Time Streaming (`TradingViewStream`, `StudySession`)** — Persistent WebSocket quotes, live OHLCV candles, Pine Script studies, and auto-reconnection
- 🧾 **Fixed Income, Macro & Derivatives** — Turkish Government Bonds (`Bond`, `riskFreeRate`), Sovereign Eurobonds (`Eurobond` + daily history), TCMB Policy/Overnight/GLP rates (`TCMB`), Inflation TÜFE/ÜFE (`Inflation`), VIOP Futures & Options (`VIOP`), Economic Calendar (`EconomicCalendar`)
- 🐦 **Twitter/X Tweet Search (`searchTweets`, `.tweets()`)** — Cookie-authenticated search with built-in Turkish asset query builders on `Ticker`, `Fund`, `FX`, and `Crypto`
- 💻 **CLI (`borsats`)** — 27 terminal commands with `table`, `json`, and `csv` output formats

## Installation

```bash
npm install @muhammedaksam/borsats
```

```bash
yarn add @muhammedaksam/borsats
```

```bash
pnpm add @muhammedaksam/borsats
```

## Quick Start

```typescript
import {
  Crypto,
  download,
  EVDS,
  evdsSeries,
  Fund,
  FX,
  Inflation,
  setEVDSKey,
  Ticker,
} from "@muhammedaksam/borsats";

// BIST Stock
const stock = new Ticker("THYAO");
console.log(await stock.info()); // Enriched quote & company info
console.log(await stock.history({ period: "1mo" })); // OHLCV data
console.log(await stock.balanceSheet); // Annual balance sheet

// Batch download
const multi = await download(["THYAO", "GARAN", "AKBNK"], { period: "1mo" });

// Forex & Precious Metals
const usd = new FX("USD");
console.log(await usd.current);
console.log(await usd.bankRates);

// Cryptocurrency
const btc = new Crypto("BTCTRY");
console.log(await btc.current);
console.log(await btc.history({ period: "1mo" }));

// TEFAS Fund
const fund = new Fund("AAK");
console.log(await fund.info);
console.log(await fund.allocation);

// Inflation
const inflation = new Inflation();
console.log(await inflation.latest("tufe"));

// EVDS (TCMB macro time-series)
setEVDSKey("YOUR_EVDS_KEY"); // Free key: https://evds3.tcmb.gov.tr
console.log(await evdsSeries("TP.DK.USD.A.YTL", { period: "1y" }));
console.log(await new EVDS().categories); // No key required
```

## Command-Line Interface (CLI)

`borsats` ships with a 27-command CLI (`table`, `json`, or `csv` output):

```bash
# Quick prices for stocks, FX, crypto, funds, and indices
npx borsats price THYAO GARAN USD BTCTRY AAK XU100

# Export 1-year OHLCV history to CSV
npx borsats history THYAO --period 1y --output csv > thyao.csv

# TradingView TA signals
npx borsats signals THYAO --interval 1h

# Technical scan & fundamental screen
npx borsats scan "rsi < 30 and volume > 1000000" --index XU100
npx borsats screen --template high_dividend --index XU030

# Bonds, TCMB rates, Eurobonds, TEFAS funds, VIOP, and economic calendar
npx borsats bonds
npx borsats tcmb --history --period 1y
npx borsats fund AAK --allocation
npx borsats economic --country TR

# Live quote watch
npx borsats watch THYAO GARAN --duration 10

# See all 27 commands
npx borsats --help
```

Supported commands: `auth`, `price`, `quote`, `search`, `history`, `scan`, `screen`, `technical`, `compare`, `watch`, `economic`, `news`, `dividends`, `splits`, `companies`, `bonds`, `tcmb`, `inflation`, `fund`, `eurobond`, `index`, `financials`, `signals`, `holders`, `targets`, `fx-rates`, `viop`.

---

## Documentation

### Ticker (BIST Stocks)

```typescript
import { Ticker } from "@muhammedaksam/borsats";

const stock = new Ticker("THYAO");

// Fast info (parallel quote + metrics + 52w/MA calculations)
const fi = stock.fastInfo;
console.log(await fi.lastPrice);
console.log(await fi.marketCap);
console.log(await fi.peRatio);
console.log(await fi.freeFloat);
console.log(await fi.foreignRatio);

// Detailed info
const info = await stock.info();
console.log(info.last, info.peRatio, info.dividendYield, info.sector);

// Historical OHLCV
const history = await stock.history({
  period: "1y",
  interval: "1d",
  actions: true, // Include dividends & splits
  adjust: true, // Set false for raw split-unadjusted prices
  autoAdjust: true, // Adds yfinance-style dividend-adjusted `adjClose`
});

// Financial statements (annual, quarterly, TTM, and parametric lastN)
const balanceSheet = await stock.balanceSheet;
const incomeStmt = await stock.incomeStmt;
const cashflow = await stock.cashflow;
const qBalanceSheet = await stock.quarterlyBalanceSheet;
const ttmIncome = await stock.ttmIncomeStmt;
const tenYears = await stock.getIncomeStmt({ lastN: 10 });
const allQuarters = await stock.getBalanceSheet({
  quarterly: true,
  lastN: "all",
});

// Banks use financialGroup: "UFRS"
const bank = new Ticker("AKBNK");
const bankBS = await bank.getBalanceSheet({ financialGroup: "UFRS" });

// Corporate actions, holders, analyst data, and KAP disclosures
const dividends = await stock.dividends;
const splits = await stock.splits;
const actions = await stock.actions;
const majorHolders = await stock.majorHolders;
const etfHolders = await stock.etfHolders;
const recommendations = await stock.recommendations; // { recommendation, target_price, upside_potential }
const recSummary = await stock.recommendationsSummary; // { strongBuy, buy, hold, sell, strongSell }
const targets = await stock.analystPriceTargets; // Alias of stock.priceTarget
const news = await stock.news;
const calendar = await stock.calendar;
const earningsDates = await stock.earningsDates;
const isin = await stock.isin;
```

### Multi-Ticker Batch Download

```typescript
import { download, Tickers } from "@muhammedaksam/borsats";

const tickers = new Tickers(["THYAO", "GARAN", "AKBNK"]);
const multiHist = await tickers.history({ period: "1mo", groupBy: "ticker" });

const data = await download(["THYAO", "ASELS"], {
  period: "3mo",
  interval: "1d",
});
```

### FX (Forex, Precious Metals & Commodities)

```typescript
import { banks, FX, metalInstitutions } from "@muhammedaksam/borsats";

const usd = new FX("USD");
console.log(await usd.current);
console.log(await usd.history({ period: "1mo" }));
console.log(await usd.history({ period: "1d", interval: "5m" })); // Intraday via TradingView

// Bank rates
console.log(await usd.bankRates);
console.log(await usd.bankRate("akbank"));
console.log(banks()); // or FX.banks()

// Precious metals & dealer/institution rates
const gold = new FX("gram-altin");
console.log(await gold.current);
console.log(await gold.institutionRates());
console.log(await gold.institutionRate("kapalicarsi"));
console.log(await gold.institutionHistory("akbank", { period: "1mo" }));
console.log(metalInstitutions()); // or FX.metalInstitutions()

// Commodities
const brent = new FX("BRENT");
const silver = new FX("XAG-USD");
```

### Index (BIST Indices)

```typescript
import { allIndices, Index, indices } from "@muhammedaksam/borsats";

console.log(await indices()); // Popular indices
console.log(await indices(true)); // Detailed with component counts
console.log(await allIndices()); // All 79 BIST indices

const xu100 = new Index("XU100");
console.log(await xu100.info);
console.log(await xu100.history({ period: "1y" }));
console.log(await xu100.components);
console.log(await xu100.componentSymbols());
console.log(await xu100.scan("rsi < 30", { interval: "1d" }));
```

### Crypto (Cryptocurrency)

```typescript
import { Crypto, cryptoPairs } from "@muhammedaksam/borsats";

console.log(await cryptoPairs("TRY"));

const btc = new Crypto("BTCTRY");
console.log(await btc.current);
console.log(await btc.history({ period: "1mo", interval: "1d" }));
console.log(await btc.taSignals("1h"));
```

### Fund (TEFAS Investment, Pension & ETF Funds)

```typescript
import {
  compareFunds,
  Fund,
  managementFees,
  screenFunds,
  searchFunds,
  withholdingTaxRate,
  withholdingTaxTable,
} from "@muhammedaksam/borsats";

// Search, screen, compare & fees
console.log(await searchFunds("banka", 10));
console.log(await screenFunds({ fundType: "YAT", minReturn1y: 50 }));
console.log(await compareFunds(["AAK", "TTE", "AFO"]));
console.log(await managementFees("YAT"));

// Fund details, history, allocation & risk (supports YAT, EMK, BYF with auto-detection)
const fund = new Fund("AAK");
console.log(await fund.fundType); // "YAT" | "EMK" | "BYF"
console.log(await fund.info); // Includes ISIN, KAP link, valor, fees, category rank
console.log(await fund.history({ period: "1y" })); // Up to 5y via TEFAS v2 JSON API
console.log(await fund.allocation); // Latest portfolio asset breakdown
console.log(await fund.allocationHistory({ period: "2mo" })); // Up to 3mo
console.log(await fund.managementFee);
console.log(await fund.riskMetrics("1y")); // Sharpe, Sortino, volatility, max drawdown

// Withholding tax (Turkish Stopaj schedule)
console.log(await fund.taxCategory); // e.g., "degisken_karma_doviz"
console.log(await fund.withholdingTaxRate("2025-08-01")); // 0.175 (17.5%)
console.log(await withholdingTaxRate("TTE", "2025-08-01")); // 0.0 (equity-heavy)
console.log(withholdingTaxTable());

// Individual stock holdings from KAP "Portföy Dağılım Raporu" PDF via OpenRouter LLM
const holdings = await fund.getHoldings(process.env.OPENROUTER_API_KEY!);
```

### EVDS (TCMB Electronic Data Delivery System)

```typescript
import {
  EVDS,
  evdsCategories,
  evdsDownload,
  evdsSearch,
  evdsSeries,
  setEVDSKey,
} from "@muhammedaksam/borsats";

// Catalogue & search (no API key needed)
console.log(await evdsCategories());
console.log(await evdsSearch("dolar"));

// Time-series data (free key from https://evds3.tcmb.gov.tr or EVDS_API_KEY env var)
setEVDSKey("YOUR_EVDS_KEY");
const usdTry = await evdsSeries("TP.DK.USD.A.YTL", { period: "1y" });
const cpiYoY = await evdsSeries("TP.FG.J0", {
  period: "2y",
  formula: "yoy_pct",
});
const multi = await evdsDownload(["TP.DK.USD.A.YTL", "TP.DK.EUR.A.YTL"], {
  period: "6mo",
});

const evds = new EVDS();
console.log(await evds.datagroups(2));
console.log(await evds.dashboard("enflasyon"));
```

### Technical Analysis, Scanner & Screener

All 6 asset classes (`Ticker`, `FX`, `Crypto`, `Index`, `Fund`, `Portfolio`) extend `TechnicalMixin`:

```typescript
import { scan, screenStocks, Screener, TechnicalScanner, Ticker } from "@muhammedaksam/borsats";

const stock = new Ticker("THYAO");
console.log(await stock.rsi("3mo", 14));
console.log(await stock.sma("3mo", 50));
console.log(await stock.supertrend("3mo"));
console.log(await stock.tilsonT3("3mo"));
console.log(await stock.taSignals("1d"));

const ta = await stock.technicals("1y");
console.log(ta.latest);
console.log(ta.all({ indicators: ["sma", "rsi", "macd", "supertrend"] }));

// Technical scanner (TradingView native API + parallel local Supertrend/T3)
const oversold = await scan("XU030", "rsi < 30 and volume > 1000000", "1d");
const scanner = new TechnicalScanner();
await scanner.setUniverse("XU100");
scanner.addCondition("close crosses_above sma_50");
console.log(await scanner.run(25));

// Fundamental screener (İş Yatırım)
const highDiv = await screenStocks({
  template: "high_dividend",
  index: "XU030",
  pe_max: 10,
});
const screener = new Screener().setIndex("XU100").addFilter("roe", 20);
console.log(await screener.run());
```

### Portfolio Management & Rebalancing

```typescript
import { Portfolio } from "@muhammedaksam/borsats";

const portfolio = new Portfolio("XU100");

portfolio
  .add("THYAO", { shares: 100, cost: 280, purchaseDate: "2024-01-15" })
  .add("GARAN", { shares: 200, cost: 50 })
  .add("USD", { shares: 1000, assetType: "fx" })
  .add("BTCTRY", { shares: 0.5 })
  .add("AAK", { shares: 1000, assetType: "fund" });

console.log(await portfolio.value);
console.log(portfolio.cost);
console.log(await portfolio.pnl, await portfolio.pnlPct);
console.log(await portfolio.weights);
console.log(await portfolio.holdings);

// Multi-asset history, correlation matrix & risk metrics (incl. beta & alpha)
console.log(await portfolio.history("1y"));
console.log(await portfolio.correlationMatrix("1y"));
console.log(await portfolio.riskMetrics("1y"));

// Target weights, drift & rebalancing
portfolio.setTargetWeights({ THYAO: 0.4, GARAN: 0.3, USD: 0.3 });
console.log(await portfolio.drift());
console.log(await portfolio.rebalancePlan(5));
console.log(await portfolio.rebalance(5, false)); // Execute share adjustments

// Serialization
const snapshot = portfolio.toDict();
const restored = Portfolio.fromDict(snapshot);
```

### Backtesting & Replay

```typescript
import { backtest, createReplay } from "@muhammedaksam/borsats";

const result = await backtest(
  "THYAO",
  (candle, position, indicators) => {
    if (position === null && indicators.rsi < 30) return "BUY";
    if (position === "long" && indicators.rsi > 70) return "SELL";
    return "HOLD";
  },
  { period: "1y", capital: 100000, commission: 0.001, slippage: 0.0005 },
);
console.log(result.summary());
console.log(result.toDict());

const replay = await createReplay("THYAO", { period: "1mo", speed: 0 });
for await (const candle of replay.replay()) {
  console.log(candle.date, candle.close);
}
```

### Real-Time Streaming & TradingView Auth

```typescript
import { createStream, setTradingViewAuth } from "@muhammedaksam/borsats";

// Optional: authenticate for real-time BIST prices (removes ~15 min delay)
await setTradingViewAuth({
  session: "YOUR_SESSIONID_COOKIE",
  sessionSign: "YOUR_SESSIONID_SIGN_COOKIE",
});

const stream = createStream();
await stream.connect();
stream.subscribeMultiple(["THYAO", "GARAN"]);
stream.onQuote("THYAO", (quote) => console.log("THYAO:", quote.lp));

// Live chart candles & Pine Script studies
stream.subscribeChart("THYAO", "1m");
await stream.addStudy("THYAO", "1m", "RSI");
stream.onStudy("THYAO", "1m", "RSI", (vals) => console.log("RSI:", vals));
```

### Fixed Income, Macro, VIOP, Calendar & Search

```typescript
import {
  Bond,
  bonds,
  companies,
  EconomicCalendar,
  Eurobond,
  eurobonds,
  Inflation,
  policyRate,
  riskFreeRate,
  search,
  TCMB,
  VIOP,
  viopContracts,
} from "@muhammedaksam/borsats";

// Government Bonds & Risk-Free Rate
console.log(await bonds());
console.log(await new Bond("10Y").yieldRate);
console.log(await riskFreeRate());

// Sovereign Eurobonds & Daily History
console.log(await eurobonds("USD"));
const eb = new Eurobond("US900123AL40");
console.log(await eb.info());
console.log(await eb.history({ period: "1mo" }));

// TCMB Rates & Inflation
console.log(await policyRate());
console.log(await new TCMB().history("policy", "1y"));
console.log(await new Inflation().calculate(100000, "2020-01", "2025-01"));

// VIOP, Economic Calendar, Companies & Unified Search
console.log(await new VIOP().futures);
console.log(await viopContracts("XU030", true));
console.log(await new EconomicCalendar().thisWeek({ country: "TR" }));
console.log(await companies());
console.log(await search("banka", { exchange: "BIST", limit: 10 }));
```

### Twitter/X Tweet Search

```typescript
import {
  FX,
  searchTweets,
  setTwitterAuth,
  Ticker,
} from "@muhammedaksam/borsats";

// Authenticate with x.com browser cookies (auth_token & ct0)
setTwitterAuth({ authToken: "YOUR_AUTH_TOKEN", ct0: "YOUR_CT0" });

const tweets = await searchTweets("$THYAO", { period: "7d", lang: "tr", limit: 50 });
const stockTweets = await new Ticker("THYAO").tweets({ period: "3d" });
const usdTweets = await new FX("USD").tweets({ period: "1d", lang: "tr" });
```

## Environment Support

- **Node.js (20+)**: Full support for all library modules, WebSocket streaming, and the `borsats` CLI.
- **Browser**: Compatible when bundled for CORS-accessible endpoints (server-side / Node.js recommended for direct scraping & WebSocket feeds).

## API Rate Limiting & Caching

Built-in per-provider rate limiting, retries, and TTL caching:

- Automatic exponential backoff retries on transient failures and HTTP 429 rate limits
- Default: 60 requests/minute per provider
- Configurable TTL caching per data domain (`REALTIME_PRICE`, `OHLCV_HISTORY`, `FINANCIAL_STATEMENTS`, `EVDS_CATALOG`, `EVDS_DATA`, `SOCIAL_DATA`, etc.)

## License

MIT © [Muhammed Mustafa AKŞAM](https://github.com/muhammedaksam)

## Credits

Inspired by and aligned with [borsapy](https://github.com/saidsurucu/borsapy/) by Said Sürücü.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Disclaimer

This library is for educational and informational purposes only. It is not financial advice. Always do your own research before making investment decisions.
