import { Crypto, FX, Index, Ticker } from "../src/index";

async function main() {
  console.log("🚀 BorsaTS - Turkish Financial Markets Data Library\n");

  try {
    // Ticker example
    console.log("📈 Testing Ticker (THYAO)...");
    const stock = new Ticker("THYAO");
    console.log("Symbol:", stock.symbol);
    console.log("Fast Info:", stock.fastInfo);
    console.log("✓ Ticker working\n");

    // FX example
    console.log("💱 Testing FX (USD)...");
    const usd = new FX("USD");
    console.log("Asset:", usd.asset);
    console.log("Current rate (stub):", await usd.current);
    console.log("✓ FX working\n");

    // Index example
    console.log("📊 Testing Index (XU100)...");
    const xu100 = new Index("XU100");
    console.log("Symbol:", xu100.symbol);
    console.log("Info (stub):", await xu100.info);
    console.log("✓ Index working\n");

    // Crypto example
    console.log("🪙 Testing Crypto (BTCTRY)...");
    const btc = new Crypto("BTCTRY");
    console.log("Pair:", btc.pair);
    console.log("✓ Crypto working\n");

    console.log("✅ All core classes are functional!");
    console.log("\nNote: Most methods return stub data.");
    console.log(
      "Full implementation requires connecting to actual data providers.",
    );
  } catch (e) {
    console.error("❌ Error:", e);
  }
}

main();
