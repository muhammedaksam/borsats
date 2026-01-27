/**
 * Test script for TradingView provider
 * Run with: npx ts-node examples/test-tradingview.ts
 */

import { getTradingViewProvider } from "../src/providers/tradingview";
import { Ticker } from "../src/ticker";

async function testTradingView() {
  console.log("🧪 Testing TradingView Provider\n");

  try {
    // Test 1: Get current quote
    console.log("📊 Test 1: Get current quote for THYAO...");
    const provider = getTradingViewProvider();
    const quote = await provider.getCurrentQuote("BIST", "THYAO");
    console.log("✅ Quote received:");
    console.log(`   Last: ${quote.last}`);
    console.log(`   Change: ${quote.change} (${quote.changePercent}%)`);
    console.log(
      `   Open: ${quote.open}, High: ${quote.high}, Low: ${quote.low}`,
    );
    console.log(`   Volume: ${quote.volume}`);
    console.log();

    // Test 2: Get historical data via Ticker class
    console.log("📈 Test 2: Get historical data for THYAO (1 month)...");
    const stock = new Ticker("THYAO");
    const history = await stock.history({ period: "1mo", interval: "1d" });
    console.log(`✅ Received ${history.length} data points`);
    if (history.length > 0) {
      const latest = history[history.length - 1];
      console.log(`   Latest: ${latest.date.toISOString().split("T")[0]}`);
      console.log(
        `   OHLCV: O=${latest.open} H=${latest.high} L=${latest.low} C=${latest.close} V=${latest.volume}`,
      );
    }
    console.log();

    // Test 3: Get info via Ticker
    console.log("ℹ️  Test 3: Get info via Ticker class...");
    const info = await stock.info();
    console.log("✅ Info received:");
    console.log(`   Symbol: ${info.symbol}`);
    console.log(`   Last: ${info.last}`);
    console.log();

    console.log("🎉 All tests passed!");
  } catch (e) {
    console.error("❌ Test failed:", e);
    if (e instanceof Error) {
      console.error("Error details:", e.message);
    }
    process.exit(1);
  }
}

// Run tests
testTradingView();
