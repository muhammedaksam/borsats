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

Turkish financial markets data library for TypeScript/JavaScript. A yfinance-like API for BIST stocks, forex, crypto, investment funds, and economic data.

**Inspired by [borsapy](https://github.com/saidsurucu/borsapy/)** - bringing the same powerful functionality to the TypeScript ecosystem.

## Features

- 📈 **BIST Stocks** - Real-time quotes, financial statements, dividends
- 💱 **65+ Currencies** - Forex rates, bank rates, precious metals
- 🪙 **Cryptocurrencies** - BTC, ETH, and more via BTCTurk
- 🏦 **Investment Funds** - TEFAS fund data, performance, allocation
- 📊 **79 BIST Indices** - XU100, XU030, XKTUM, and more
- 📉 **Technical Indicators** - RSI, MACD, Bollinger Bands, and more
- 💼 **Portfolio Management** - Track performance, calculate risk metrics
- 🔍 **Stock Screener** - Filter by fundamentals
- 🌐 **Works in Node.js and Browser**

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
import { Crypto, Fund, FX, Ticker } from "@muhammedaksam/borsats";

// Stock data
const stock = new Ticker("THYAO");
console.log(await stock.info); // Real-time quote
console.log(await stock.history({ period: "1mo" })); // OHLCV data
console.log(await stock.balanceSheet); // Financial statements

// Forex
const usd = new FX("USD");
console.log(await usd.current); // Current rate
console.log(await usd.history({ period: "1mo" })); // Historical data
console.log(await usd.bankRates); // All bank rates

// Cryptocurrency
const btc = new Crypto("BTCTRY");
console.log(await btc.current); // Current price
console.log(await btc.history({ period: "1mo" })); // Historical OHLCV

// Investment Fund
const fund = new Fund("AAK");
console.log(await fund.info); // Fund details
console.log(await fund.performance); // Performance metrics
```

## Documentation

### Ticker (BIST Stocks)

```typescript
import { Ticker } from "@muhammedaksam/borsats";

const stock = new Ticker("THYAO");

// Fast info (cached, no API call)
const fastInfo = await stock.fastInfo;
console.log(fastInfo.lastPrice);
console.log(fastInfo.marketCap);
console.log(fastInfo.peRatio);

// Detailed info
const info = await stock.info;
console.log(info.last);
console.log(info.trailingPE);
console.log(info.dividendYield);

// Historical data
const history = await stock.history({
  period: "1y",
  interval: "1d",
  actions: true, // Include dividends/splits
});

// Financial statements
const balanceSheet = await stock.balanceSheet;
const incomeStmt = await stock.incomeStmt;
const cashflow = await stock.cashflow;

// Quarterly statements
const qBalanceSheet = await stock.quarterlyBalanceSheet;
const qIncomeStmt = await stock.quarterlyIncomeStmt;

// Corporate actions
const dividends = await stock.dividends;
const splits = await stock.splits;

// Company info
const holders = await stock.majorHolders;
const news = await stock.news;
```

### FX (Forex and Commodities)

```typescript
import { banks, FX } from "@muhammedaksam/borsats";

const usd = new FX("USD");

// Current rate
console.log(await usd.current);

// Historical data
console.log(await usd.history({ period: "1mo" }));

// Intraday data (for supported pairs)
console.log(await usd.history({ period: "1d", interval: "1m" }));

// Bank rates
console.log(await usd.bankRates); // All banks
console.log(await usd.bankRate("akbank")); // Specific bank

// Supported banks
console.log(banks());

// Precious metals
const gold = new FX("gram-altin");
console.log(await gold.current);
console.log(await gold.institutionRates); // All dealers
console.log(await gold.institutionRate("kapalicarsi")); // Specific dealer

// Commodities
const brent = new FX("BRENT");
const silver = new FX("XAG-USD");
```

### Index (BIST Indices)

```typescript
import { allIndices, Index, indices } from "@muhammedaksam/borsats";

// List indices
console.log(indices()); // Popular indices
console.log(allIndices()); // All 79 indices

// Index data
const xu100 = new Index("XU100");
console.log(await xu100.info); // Current value
console.log(await xu100.history({ period: "1y" })); // Historical data

// Components
console.log(await xu100.components); // All stocks with details
console.log(await xu100.componentSymbols); // Just symbols
```

### Crypto (Cryptocurrency)

```typescript
import { Crypto, cryptoPairs } from "@muhammedaksam/borsats";

// List available pairs
console.log(await cryptoPairs());

// Crypto data
const btc = new Crypto("BTCTRY");
console.log(await btc.current); // Current price
console.log(await btc.history({ period: "1mo" })); // OHLCV data
```

### Fund (Investment Funds)

```typescript
import { Fund, screenFunds, searchFunds } from "@muhammedaksam/borsats";

// Search funds
console.log(await searchFunds("banka"));

// Screen funds
console.log(
  await screenFunds({
    fundType: "YAT",
    minReturn1y: 50,
  }),
);

// Fund data
const fund = new Fund("AAK");
console.log(await fund.info); // Fund details
console.log(await fund.history({ period: "1y" })); // NAV history
console.log(await fund.performance); // Performance metrics
console.log(await fund.allocation); // Asset allocation
console.log(await fund.riskMetrics({ period: "1y" })); // Sharpe, Sortino, etc.
```

### Portfolio Management

```typescript
import { Portfolio } from "@muhammedaksam/borsats";

const portfolio = new Portfolio();

// Add holdings
portfolio
  .add("THYAO", { shares: 100, cost: 280 })
  .add("GARAN", { shares: 200, cost: 50 })
  .add("USD", { shares: 1000, assetType: "fx" })
  .add("gram-altin", { shares: 10, assetType: "fx" })
  .add("BTCTRY", { shares: 0.5 })
  .add("AAK", { shares: 1000, assetType: "fund" });

// Set benchmark
portfolio.setBenchmark("XU100");

// Portfolio stats
console.log(portfolio.value); // Total value
console.log(portfolio.cost); // Total cost
console.log(portfolio.pnl); // Profit/loss
console.log(portfolio.pnlPct); // P/L percentage
console.log(portfolio.weights); // Asset weights

// Performance
console.log(await portfolio.history({ period: "1y" }));
console.log(await portfolio.riskMetrics({ period: "1y" }));
console.log(await portfolio.sharpeRatio());
console.log(await portfolio.beta());

// Export/Import
const data = portfolio.toDict();
const newPortfolio = Portfolio.fromDict(data);
```

### Technical Analysis

```typescript
import { Ticker } from "@muhammedaksam/borsats";

const stock = new Ticker("THYAO");

// Single values
console.log(await stock.rsi()); // RSI(14)
console.log(await stock.sma({ period: 20 })); // SMA(20)
console.log(await stock.ema({ period: 12 })); // EMA(12)
console.log(await stock.macd()); // MACD
console.log(await stock.bollingerBands()); // Bollinger Bands

// Technical analyzer
const ta = await stock.technicals({ period: "1y" });
console.log(ta.latest); // All indicators at once
console.log(ta.rsi()); // Full RSI series
console.log(ta.macd()); // Full MACD series

// History with indicators
const df = await stock.historyWithIndicators({
  period: "3mo",
  indicators: ["sma", "rsi", "macd"],
});
```

## Environment Support

This library works in both Node.js and browser environments:

- **Node.js**: Full support with all features
- **Browser**: Compatible when bundled (some features may require CORS-enabled APIs)

## API Rate Limiting

The library includes built-in rate limiting and retry logic:

- Automatic retries with exponential backoff
- Default: 60 requests per minute per provider
- Configurable per provider
- Response caching to reduce API calls

## License

MIT © [Muhammed Mustafa AKŞAM](https://github.com/muhammedaksam)

## Credits

Inspired by and based on [borsapy](https://github.com/saidsurucu/borsapy/) by Said Sürücü.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Disclaimer

This library is for educational and informational purposes only. It is not financial advice. Always do your own research before making investment decisions.
