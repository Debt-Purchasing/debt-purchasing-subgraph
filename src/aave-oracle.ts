import {
  BigInt,
  BigDecimal,
  Address,
  log,
  ethereum,
} from "@graphprotocol/graph-ts";
import { TokenPrice, PriceSnapshot } from "../generated/schema";
import {
  AssetSourceUpdated as AssetSourceUpdatedEvent,
  FallbackOracleUpdated as FallbackOracleUpdatedEvent,
} from "../generated/AaveOracle/AaveOracle";

// Constants
const ZERO_BD = BigDecimal.fromString("0");
const ZERO_BI = BigInt.fromI32(0);
const TESTNET_TIMESTAMP = BigInt.fromI32(1640995200);
const AAVE_ORACLE_ADDRESS = Address.fromString(
  "0x2da88497588bf89281816106C7259e31AF45a663"
);

// Development mode flag - set to true for dynamic UI testing
const ENABLE_DYNAMIC_PRICES = true;

// Helper function to get or create TokenPrice entity
function getOrCreateTokenPrice(asset: Address): TokenPrice {
  let tokenPrice = TokenPrice.load(asset.toHexString());
  if (tokenPrice == null) {
    tokenPrice = new TokenPrice(asset.toHexString());
    tokenPrice.symbol = "UNKNOWN";
    tokenPrice.decimals = 18;
    tokenPrice.priceUSD = ZERO_BD;
    tokenPrice.lastUpdatedAt = TESTNET_TIMESTAMP;
    tokenPrice.liquidationThreshold = BigDecimal.fromString("0.8");
    tokenPrice.ltv = BigDecimal.fromString("0.75");
    tokenPrice.oracleSource = "";
    tokenPrice.save();
  }
  return tokenPrice;
}

// Fetch price through Aave Oracle (works for both mainnet and testnet)
function fetchPriceFromAaveOracle(asset: Address): BigDecimal {
  // TODO: Implement when we have AaveOracle ABI
  // let oracle = AaveOracle.bind(AAVE_ORACLE_ADDRESS);
  // let priceCall = oracle.try_getAssetPrice(asset);
  //
  // if (!priceCall.reverted) {
  //   // Aave Oracle returns price in 8 decimals (like Chainlink)
  //   return priceCall.value
  //     .toBigDecimal()
  //     .div(BigDecimal.fromString("100000000"));
  // }

  // For now, fallback to static testnet prices
  return fetchTestnetPriceFallback(asset);
}

// Fallback for testnet when oracle calls fail or for testing
function fetchTestnetPriceFallback(asset: Address): BigDecimal {
  let assetStr = asset.toHexString().toLowerCase();

  // Known testnet asset prices (static from mock oracles) - UPDATED WITH CORRECT ADDRESSES
  if (assetStr == "0x29f2d40b0605204364af54ec677bd022da425d03") {
    return BigDecimal.fromString("60000"); // WBTC - from mock oracle 0x784B90bA1E9a8cf3C9939c2e072F058B024C4b8a
  } else if (assetStr == "0xff34b3d4aee8ddcd6f9afffb6fe49bd371b8a357") {
    return BigDecimal.fromString("1"); // DAI - from mock oracle 0x9aF11c35c5d3Ae182C0050438972aac4376f9516
  } else if (assetStr == "0xf8fb3713d459d7c1018bd0a49d19b4c44290ebe5") {
    return BigDecimal.fromString("15"); // LINK - from mock oracle 0x14fC51b7df22b4D393cD45504B9f0A3002A63F3F
  } else if (assetStr == "0x94a9d9ac8a22534e3faca9f4e7f2e2cf85d5e4c8") {
    return BigDecimal.fromString("1"); // USDC - from mock oracle 0x98458D6A99489F15e6eB5aFa67ACFAcf6F211051
  }

  return ZERO_BD; // Unknown asset
}

// Initialize prices by calling Aave Oracle directly
function initializePricesFromAaveOracle(): void {
  log.info("Initializing prices from Aave Oracle", []);

  // Known Sepolia testnet assets - UPDATED WITH CORRECT ADDRESSES
  let assets = [
    "0x29f2D40B0605204364af54EC677bD022dA425d03", // WBTC
    "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357", // DAI
    "0xf8Fb3713D459D7C1018BD0A49D19b4C44290EBE5", // LINK
    "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8", // USDC
  ];

  for (let i = 0; i < assets.length; i++) {
    let asset = Address.fromString(assets[i]);
    let tokenPrice = getOrCreateTokenPrice(asset);

    // Try to fetch from Aave Oracle
    let price = fetchPriceFromAaveOracle(asset);
    if (!price.equals(ZERO_BD)) {
      tokenPrice.priceUSD = price;
      tokenPrice.lastUpdatedAt = TESTNET_TIMESTAMP;

      // Set asset-specific parameters - UPDATED WITH CORRECT ADDRESSES
      if (assets[i] == "0x29f2D40B0605204364af54EC677bD022dA425d03") {
        tokenPrice.symbol = "WBTC";
        tokenPrice.decimals = 8;
        tokenPrice.liquidationThreshold = BigDecimal.fromString("0.8");
        tokenPrice.ltv = BigDecimal.fromString("0.75");
        tokenPrice.oracleSource = "0x784B90bA1E9a8cf3C9939c2e072F058B024C4b8a"; // Mock oracle
      } else if (assets[i] == "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357") {
        tokenPrice.symbol = "DAI";
        tokenPrice.decimals = 18;
        tokenPrice.liquidationThreshold = BigDecimal.fromString("0.8");
        tokenPrice.ltv = BigDecimal.fromString("0.75");
        tokenPrice.oracleSource = "0x9aF11c35c5d3Ae182C0050438972aac4376f9516"; // Mock oracle
      } else if (assets[i] == "0xf8Fb3713D459D7C1018BD0A49D19b4C44290EBE5") {
        tokenPrice.symbol = "LINK";
        tokenPrice.decimals = 18;
        tokenPrice.liquidationThreshold = BigDecimal.fromString("0.825");
        tokenPrice.ltv = BigDecimal.fromString("0.8");
        tokenPrice.oracleSource = "0x14fC51b7df22b4D393cD45504B9f0A3002A63F3F"; // Mock oracle
      } else if (assets[i] == "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8") {
        tokenPrice.symbol = "USDC";
        tokenPrice.decimals = 6;
        tokenPrice.liquidationThreshold = BigDecimal.fromString("0.87");
        tokenPrice.ltv = BigDecimal.fromString("0.85");
        tokenPrice.oracleSource = "0x98458D6A99489F15e6eB5aFa67ACFAcf6F211051"; // Mock oracle
      }

      tokenPrice.save();

      log.info("Initialized price for {} ({}): ${} from oracle {}", [
        tokenPrice.symbol,
        asset.toHexString(),
        price.toString(),
        tokenPrice.oracleSource,
      ]);
    }
  }

  log.info("Price initialization completed", []);
}

// Helper function to create price snapshot (for historical tracking)
function createPriceSnapshot(
  asset: Address,
  priceInUSD: BigDecimal,
  timestamp: BigInt,
  blockNumber: BigInt
): void {
  let snapshotId = asset.toHexString() + "-" + timestamp.toString();
  let snapshot = new PriceSnapshot(snapshotId);

  snapshot.token = asset.toHexString();
  snapshot.priceUSD = priceInUSD;
  snapshot.timestamp = timestamp;
  snapshot.blockNumber = blockNumber;

  snapshot.save();
}

// Track Aave Oracle events for asset source changes
export function handleAssetSourceUpdated(event: AssetSourceUpdatedEvent): void {
  log.info("Handling Aave Oracle AssetSourceUpdated event", []);

  let asset = event.params.asset;
  let newSource = event.params.source;

  log.info("Asset {} oracle source updated to {}", [
    asset.toHexString(),
    newSource.toHexString(),
  ]);

  // For now, initialize prices when this event is triggered
  initializePricesFromAaveOracle();
}

export function handleFallbackOracleUpdated(
  event: FallbackOracleUpdatedEvent
): void {
  log.info("Handling Aave Oracle FallbackOracleUpdated event", []);

  let fallbackOracle = event.params.fallbackOracle;

  log.info("Fallback oracle updated to {}", [fallbackOracle.toHexString()]);

  // For now, re-initialize prices
  initializePricesFromAaveOracle();

  log.info("Fallback oracle update processed", []);
}

// Dynamic price simulation for UI testing
function simulatePriceMovement(
  asset: Address,
  basePrice: BigDecimal,
  timestamp: BigInt
): BigDecimal {
  if (!ENABLE_DYNAMIC_PRICES) {
    return basePrice; // Return static price if dynamic mode disabled
  }

  // Create predictable but varying prices based on block timestamp
  let timeVariation = timestamp.mod(BigInt.fromI32(3600)); // 1 hour cycle
  let priceVariation = timeVariation
    .toBigDecimal()
    .div(BigDecimal.fromString("3600"));

  let assetStr = asset.toHexString().toLowerCase();

  if (assetStr == "0x29f2d40b0605204364af54ec677bd022da425d03") {
    // WBTC: Simulate $60,000 ± 10% ($54,000 - $66,000)
    let variation = priceVariation
      .times(BigDecimal.fromString("0.2"))
      .minus(BigDecimal.fromString("0.1"));
    return basePrice.times(BigDecimal.fromString("1").plus(variation));
  } else if (assetStr == "0xf8fb3713d459d7c1018bd0a49d19b4c44290ebe5") {
    // LINK: Simulate $15 ± 20% ($12 - $18)
    let variation = priceVariation
      .times(BigDecimal.fromString("0.4"))
      .minus(BigDecimal.fromString("0.2"));
    return basePrice.times(BigDecimal.fromString("1").plus(variation));
  }

  return basePrice; // Stable assets (DAI, USDC) remain fixed
}

// Update prices dynamically for UI testing
function updateDynamicPrices(blockTimestamp: BigInt): void {
  if (!ENABLE_DYNAMIC_PRICES) {
    return; // Skip if dynamic mode disabled
  }

  log.info("Updating dynamic prices for UI testing", []);

  let assets = [
    "0x29f2D40B0605204364af54EC677bD022dA425d03", // WBTC
    "0xf8Fb3713D459D7C1018BD0A49D19b4C44290EBE5", // LINK
  ];

  for (let i = 0; i < assets.length; i++) {
    let asset = Address.fromString(assets[i]);
    let tokenPrice = TokenPrice.load(asset.toHexString());

    if (tokenPrice != null) {
      let oldPrice = tokenPrice.priceUSD;
      let basePrice = getBasePriceForAsset(asset);
      let newPrice = simulatePriceMovement(asset, basePrice, blockTimestamp);

      // Only update if price changed significantly (>0.5%)
      let priceChange = newPrice.minus(oldPrice).div(oldPrice);
      if (
        priceChange.gt(BigDecimal.fromString("0.005")) ||
        priceChange.lt(BigDecimal.fromString("-0.005"))
      ) {
        tokenPrice.priceUSD = newPrice;
        tokenPrice.lastUpdatedAt = blockTimestamp;
        tokenPrice.save();

        // Create price snapshot for historical tracking
        createPriceSnapshot(asset, newPrice, blockTimestamp, ZERO_BI);

        log.info("Price updated for {}: ${} ({}% change)", [
          tokenPrice.symbol,
          newPrice.toString(),
          priceChange.times(BigDecimal.fromString("100")).toString(),
        ]);
      }
    }
  }
}

// Get base price for dynamic simulation
function getBasePriceForAsset(asset: Address): BigDecimal {
  let assetStr = asset.toHexString().toLowerCase();

  if (assetStr == "0x29f2d40b0605204364af54ec677bd022da425d03") {
    return BigDecimal.fromString("60000"); // WBTC base
  } else if (assetStr == "0xf8fb3713d459d7c1018bd0a49d19b4c44290ebe5") {
    return BigDecimal.fromString("15"); // LINK base
  } else if (assetStr == "0xff34b3d4aee8ddcd6f9afffb6fe49bd371b8a357") {
    return BigDecimal.fromString("1"); // DAI
  } else if (assetStr == "0x94a9d9ac8a22534e3faca9f4e7f2e2cf85d5e4c8") {
    return BigDecimal.fromString("1"); // USDC
  }

  return ZERO_BD;
}

// Export helper functions for use in other handlers
export {
  initializePricesFromAaveOracle,
  fetchPriceFromAaveOracle,
  fetchTestnetPriceFallback,
  createPriceSnapshot,
  updateDynamicPrices,
};
