/**
 * Valid period values for historical data
 */
export type Period =
  | "1d"
  | "5d"
  | "1w"
  | "1mo"
  | "3mo"
  | "6mo"
  | "1y"
  | "2y"
  | "5y"
  | "10y"
  | "ytd"
  | "max"
  | "1g"
  | "5g"
  | "1ay"
  | "3ay"
  | "1h"
  | "3h";

/**
 * Valid interval values for OHLCV data
 */
export type Interval =
  | "1m"
  | "3m"
  | "5m"
  | "15m"
  | "30m"
  | "45m"
  | "1h"
  | "4h"
  | "1d"
  | "1w"
  | "1mo";

/**
 * Valid fund types for TEFAS
 */
export type FundType = "YAT" | "EMK";

/**
 * OHLCV (Open, High, Low, Close, Volume) data structure
 */
export interface OHLCVData {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Current price/rate information
 */
export interface CurrentData {
  symbol: string;
  last: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  bid?: number;
  ask?: number;
  change?: number;
  changePercent?: number;
  updateTime?: Date;
}

/**
 * Dividend record
 */
export interface DividendData {
  date: Date;
  dividend: number;
  type?: string;
}

/**
 * Stock split record
 */
export interface SplitData {
  date: Date;
  ratio: number;
  from: number;
  to: number;
}

/**
 * Corporate action (dividend or split)
 */
export interface ActionData {
  date: Date;
  type: "dividend" | "split";
  value: number;
  details?: Record<string, unknown>;
}

/**
 * Financial statement row
 */
export interface FinancialRow {
  item: string;
  [period: string]: number | string;
}

/**
 * Balance sheet data
 */
export type BalanceSheet = FinancialRow[];

/**
 * Income statement data
 */
export type IncomeStatement = FinancialRow[];

/**
 * Cash flow statement data
 */
export type CashFlowStatement = FinancialRow[];

/**
 * Major holder information
 */
export interface HolderData {
  name: string;
  percentage: number;
  shares?: number;
}

/**
 * Analyst recommendation
 */
export interface Recommendation {
  firm: string;
  date: Date;
  rating: "BUY" | "HOLD" | "SELL" | "STRONG_BUY" | "STRONG_SELL";
  targetPrice?: number;
}

/**
 * Price target data
 */
export interface PriceTarget {
  current: number;
  mean: number;
  median?: number;
  high: number;
  low: number;
  numberOfAnalysts: number;
}

/**
 * News/disclosure item
 */
export interface NewsItem {
  date: Date;
  title: string;
  summary?: string;
  url?: string;
  source?: string;
}

/**
 * Bank exchange rate
 */
// BankRate update
export interface BankRate {
  bank: string;
  bankName?: string;
  currency: string;
  buy: number;
  sell: number;
  spread: number;
  updated?: Date;
}

export interface MetalInstitutionRate {
  institution: string;
  institutionName: string;
  asset: string;
  buy: number;
  sell: number;
  spread: number;
  updated?: Date;
}

/**
 * Institution rate (for precious metals) - Rename to avoid conflict if needed, or keep
 */
export interface InstitutionRate {
  institution: string;
  institutionName: string;
  asset: string;
  buy: number;
  sell: number;
  spread: number;
  updated?: Date;
}

/**
 * Fund information
 */
export interface FundInfo {
  symbol: string;
  name: string;
  type: string;
  price: number;
  dailyReturn?: number;
  weeklyReturn?: number;
  monthlyReturn?: number;
  yearlyReturn?: number;
  totalValue?: number;
  isin?: string;
  categoryRank?: string;
  allocation?: AllocationData[];
}

/**
 * Fund asset allocation
 */
export interface AllocationData {
  date: Date;
  assetType: string;
  assetName: string;
  weight: number;
}

/**
 * Index component information
 */
export interface IndexComponent {
  symbol: string;
  name: string;
  weight?: number;
}

/**
 * Index information
 */
export interface IndexInfo {
  symbol: string;
  name: string;
  value: number;
  change?: number;
  changePercent?: number;
  updateTime?: Date;
}

/**
 * Crypto pair information
 */
export interface CryptoPair {
  pair: string;
  base: string;
  quote: string;
}

/**
 * Risk metrics
 */
export interface RiskMetrics {
  annualizedReturn: number;
  annualizedVolatility: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  beta?: number;
  alpha?: number;
  riskFreeRate?: number;
  tradingDays?: number;
}

/**
 * Portfolio holding
 */
export interface Holding {
  symbol: string;
  assetType: "stock" | "fx" | "crypto" | "fund";
  shares: number;
  costPerShare?: number;
  currentPrice?: number;
  value?: number;
  weight?: number;
  pnl?: number;
  pnlPct?: number;
  purchaseDate?: Date | string;
}

/**
 * HTTP request options
 */
export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean>;
  data?: unknown;
  timeout?: number;
  maxRetries?: number;
}

/**
 * Cache options
 */
export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  enabled?: boolean;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  rateLimit?: number;
  headers?: Record<string, string>;
  cache?: CacheOptions;
}

/**
 * Screener criteria definition
 */
export interface ScreenerCriteria {
  id: string;
  name: string;
  min?: string;
  max?: string;
}

/**
 * Screener result item
 */
export interface ScreenerResult {
  symbol: string;
  name: string;
  [key: string]: string | number;
}

/**
 * Asset type for search and stream
 */
export type AssetType =
  | "stock"
  | "forex"
  | "fx"
  | "crypto"
  | "index"
  | "futures"
  | "bond"
  | "fund"
  | "etf";
