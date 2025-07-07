import { BigInt, BigDecimal, Address } from "@graphprotocol/graph-ts";
import {
  Token,
  PriceSnapshot,
  ProtocolMetrics,
  DebtPosition,
  AssetOracleMapping,
  OracleAssetMapping,
  User,
} from "../generated/schema";

// Helper function to get or create Token entity (merged from TokenPrice)
export function getOrCreateToken(asset: Address): Token {
  let token = Token.load(asset.toHexString());
  if (token == null) {
    token = new Token(asset.toHexString());
    token.symbol = getTokenSymbol(asset);

    // Set decimals based on token address
    let addressStr = asset.toHexString().toLowerCase();
    if (addressStr == "0x1b8ea7c3b44465be550ebaef50ff6bc5f25ee50c") {
      token.decimals = 8; // WBTC
    } else if (addressStr == "0x005104eb2fd93a0c8f26e18934289ab91596e6bf") {
      token.decimals = 6; // USDC
    } else if (addressStr == "0xd9126e24fc2e1bb395cca8b03c5e2aefabac35ea") {
      token.decimals = 6; // USDT
    } else {
      token.decimals = 18; // Default for all other tokens
    }

    token.priceUSD = BigDecimal.fromString("0");
    token.lastUpdatedAt = BigInt.fromI32(0);
    token.oracleSource = "";
    token.save();
  }
  return token;
}

// Helper function to create or update asset-oracle mapping
export function createOrUpdateAssetOracleMapping(
  assetAddress: Address,
  oracleAddress: Address,
  timestamp: BigInt
): AssetOracleMapping {
  let mappingId = assetAddress.toHexString();
  let mapping = AssetOracleMapping.load(mappingId);

  if (mapping == null) {
    mapping = new AssetOracleMapping(mappingId);
    mapping.asset = assetAddress;
    mapping.oracle = oracleAddress;
    mapping.isActive = true;
    mapping.createdAt = timestamp;
    mapping.lastUpdatedAt = timestamp;
  } else {
    // Update existing mapping
    let oldOracle = mapping.oracle.toHexString();
    mapping.oracle = oracleAddress;
    mapping.lastUpdatedAt = timestamp;
  }

  mapping.save();
  return mapping;
}

// Helper function to get oracle address for an asset
export function getOracleForAsset(assetAddress: Address): Address | null {
  let mapping = AssetOracleMapping.load(assetAddress.toHexString());
  if (mapping != null && mapping.isActive) {
    return Address.fromBytes(mapping.oracle);
  }
  return null;
}

// Helper function to create or update reverse mapping (Oracle -> Asset)
export function createOrUpdateOracleAssetMapping(
  oracleAddress: Address,
  assetAddress: Address,
  timestamp: BigInt
): void {
  let mappingId = oracleAddress.toHexString();
  let mapping = OracleAssetMapping.load(mappingId);

  if (mapping == null) {
    mapping = new OracleAssetMapping(mappingId);
    mapping.oracle = oracleAddress;
    mapping.asset = assetAddress;
    mapping.isActive = true;
    mapping.createdAt = timestamp;
    mapping.lastUpdatedAt = timestamp;
  } else {
    // Update existing mapping
    mapping.asset = assetAddress;
    mapping.lastUpdatedAt = timestamp;
  }

  mapping.save();
}

// Helper function to get asset address for an oracle (for efficient lookup)
export function getAssetForOracle(oracleAddress: Address): Address | null {
  let mapping = OracleAssetMapping.load(oracleAddress.toHexString());
  if (mapping != null && mapping.isActive) {
    return Address.fromBytes(mapping.asset);
  }
  return null;
}

// Helper function to create price snapshot
export function createPriceSnapshot(
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

// Helper function to get or create debt position
export function getOrCreateDebtPosition(
  address: Address,
  owner: Address,
  timestamp: BigInt
): DebtPosition {
  let position = DebtPosition.load(address.toHexString());
  if (position == null) {
    position = new DebtPosition(address.toHexString());
    position.owner = owner;
    position.nonce = BigInt.fromI32(0);
    position.lastUpdatedAt = timestamp;
    position.save();

    // Update protocol metrics
    let metrics = ProtocolMetrics.load("protocol");
    if (metrics != null) {
      metrics.totalPositions = metrics.totalPositions.plus(BigInt.fromI32(1));
      metrics.save();
    }
  }
  return position;
}

// Helper function to get current token price in USD
export function getTokenPriceUSD(tokenAddress: Address): BigDecimal {
  let token = Token.load(tokenAddress.toHexString());
  if (token != null && token.priceUSD.gt(BigDecimal.fromString("0"))) {
    return token.priceUSD;
  }

  // Return a default price if not found (this should rarely happen)
  return BigDecimal.fromString("1"); // Default $1 USD
}

// Helper function to calculate USD value of token amount
export function calculateUSDValue(
  tokenAddress: Address,
  amount: BigDecimal
): BigDecimal {
  let priceUSD = getTokenPriceUSD(tokenAddress);
  return amount.times(priceUSD);
}

// Token address mapping for Sepolia with decimals
export const TOKEN_ADDRESSES = new Map<string, string>();
TOKEN_ADDRESSES.set("0xd6c774778564ec1973b24a15ee4a5d00742e6575", "WETH");
TOKEN_ADDRESSES.set("0xb8057e942399f3714d40c0be7f4391ee447f42c9", "wstETH");
TOKEN_ADDRESSES.set("0x1b8ea7c3b44465be550ebaef50ff6bc5f25ee50c", "WBTC");
TOKEN_ADDRESSES.set("0x005104eb2fd93a0c8f26e18934289ab91596e6bf", "USDC");
TOKEN_ADDRESSES.set("0xe0f11265b326df8f5c3e1db6aa8dcd506fd4cc5b", "DAI");
TOKEN_ADDRESSES.set("0x2aa4fc36242b9e4e169542305d16dff2cc0ecdae", "LINK");
TOKEN_ADDRESSES.set("0xbf088f3702000ebd6728b647a511ff0ae6867fc6", "AAVE");
TOKEN_ADDRESSES.set("0x9204befc95e67e6c8b5f58e09659cc4658af8730", "cbETH");
TOKEN_ADDRESSES.set("0xd9126e24fc2e1bb395cca8b03c5e2aefabac35ea", "USDT");
TOKEN_ADDRESSES.set("0x5e0e0d4a40b5d20b51b3f591485b00513c68b519", "rETH");
TOKEN_ADDRESSES.set("0xae1107d669f519fcb8ec58304a8cce04cbcb0349", "LUSD");
TOKEN_ADDRESSES.set("0x28614b7a40ca9e9c6bf0ca66f4f841594d3223b9", "CRV");

// Oracle address mapping for Sepolia
export const ORACLE_ADDRESSES = new Map<string, string>();
ORACLE_ADDRESSES.set("0x4d5f545400937997a594eb9f5b052381430e38d5", "WETH");
ORACLE_ADDRESSES.set("0xff7997e167b9d8709fe2a764672c075be1d734ec", "wstETH");
ORACLE_ADDRESSES.set("0xcf3bc3dae51092f2a0bc3ca119bc761e73166cda", "WBTC");
ORACLE_ADDRESSES.set("0x7d4b1defb01610bcc0f7088649ed53bb7bfd9aa2", "USDC");
ORACLE_ADDRESSES.set("0x6b02ded5e53730a3d046831068df843634fc3be3", "DAI");
ORACLE_ADDRESSES.set("0xbf3575382f32c37b268113b1f4b30a9bc8e9cbec", "LINK");
ORACLE_ADDRESSES.set("0xfadcad80259cb08eb9db330b4e9b28d17fc97960", "AAVE");
ORACLE_ADDRESSES.set("0xcd6cda9fdf5170c94ad8a8faad4c9955f523a020", "cbETH");
ORACLE_ADDRESSES.set("0xcf09ddcb2328446983058f41fdf75be8cc656e5d", "USDT");
ORACLE_ADDRESSES.set("0x1fb2ad8b17996a4b8a87e1d8d599c95c6b9b918a", "rETH");
ORACLE_ADDRESSES.set("0xd5a1668be77ce93c5bd82e2f82dad5b529cb2c13", "LUSD");
ORACLE_ADDRESSES.set("0x251936fc84a0e1e585c3cbe74234a987c3c3c18e", "CRV");

// Helper function to initialize token with proper metadata
export function initializeToken(
  tokenAddress: Address,
  symbol: string,
  oracleAddress: Address
): Token {
  let token = getOrCreateToken(tokenAddress);
  token.symbol = symbol;
  token.oracleSource = oracleAddress.toHexString();

  token.save();
  return token;
}

// Helper function to get token symbol from address
export function getTokenSymbol(address: Address): string {
  let symbol = TOKEN_ADDRESSES.get(address.toHexString().toLowerCase());
  return symbol ? symbol : "UNKNOWN";
}

// Helper function to get oracle token from address
export function getOracleTokenSymbol(address: Address): string {
  let symbol = ORACLE_ADDRESSES.get(address.toHexString().toLowerCase());
  return symbol ? symbol : "UNKNOWN";
}
