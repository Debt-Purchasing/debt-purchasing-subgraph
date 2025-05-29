import { BigInt, BigDecimal, Address, log } from "@graphprotocol/graph-ts";
import {
  Supply as AaveSupplyEvent,
  Borrow as AaveBorrowEvent,
  Repay as AaveRepayEvent,
  Withdraw as AaveWithdrawEvent,
} from "../generated/AavePool/AavePool";
import {
  TokenPrice,
  PriceSnapshot,
  ProtocolMetrics,
} from "../generated/schema";

// Helper function to get or create TokenPrice entity
function getOrCreateTokenPrice(asset: Address): TokenPrice {
  let tokenPrice = TokenPrice.load(asset.toHexString());
  if (tokenPrice == null) {
    tokenPrice = new TokenPrice(asset.toHexString());
    tokenPrice.symbol = "UNKNOWN";
    tokenPrice.decimals = 18;
    tokenPrice.priceUSD = BigDecimal.fromString("0");
    tokenPrice.lastUpdatedAt = BigInt.fromI32(0);
    tokenPrice.liquidationThreshold = BigDecimal.fromString("0");
    tokenPrice.ltv = BigDecimal.fromString("0");
    tokenPrice.save();
  }
  return tokenPrice;
}

// Helper function to create price snapshot
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

// Helper function to update protocol metrics
function updateProtocolMetrics(timestamp: BigInt): void {
  let metrics = ProtocolMetrics.load("protocol");
  if (metrics == null) {
    metrics = new ProtocolMetrics("protocol");
    metrics.totalUsers = BigInt.fromI32(0);
    metrics.totalPositions = BigInt.fromI32(0);
    metrics.totalActiveOrders = BigInt.fromI32(0);
    metrics.totalVolumeUSD = BigDecimal.fromString("0");
    metrics.lastUpdatedAt = timestamp;
  }

  metrics.lastUpdatedAt = timestamp;
  metrics.save();
}

export function handleAaveSupply(event: AaveSupplyEvent): void {
  log.info("Handling Aave Supply event for asset: {}", [
    event.params.reserve.toHexString(),
  ]);

  // Update token price tracking
  let tokenPrice = getOrCreateTokenPrice(event.params.reserve);
  tokenPrice.lastUpdatedAt = event.block.timestamp;
  tokenPrice.save();

  // Create price snapshot if significant activity
  if (event.params.amount.gt(BigInt.fromString("1000000000000000000"))) {
    // > 1 token
    createPriceSnapshot(
      event.params.reserve,
      tokenPrice.priceUSD,
      event.block.timestamp,
      event.block.number
    );
  }

  updateProtocolMetrics(event.block.timestamp);
}

export function handleAaveBorrow(event: AaveBorrowEvent): void {
  log.info("Handling Aave Borrow event for asset: {}", [
    event.params.reserve.toHexString(),
  ]);

  // Update token price tracking
  let tokenPrice = getOrCreateTokenPrice(event.params.reserve);
  tokenPrice.lastUpdatedAt = event.block.timestamp;
  tokenPrice.save();

  // Create price snapshot for borrow events (important for debt calculations)
  createPriceSnapshot(
    event.params.reserve,
    tokenPrice.priceUSD,
    event.block.timestamp,
    event.block.number
  );

  updateProtocolMetrics(event.block.timestamp);
}

export function handleAaveRepay(event: AaveRepayEvent): void {
  log.info("Handling Aave Repay event for asset: {}", [
    event.params.reserve.toHexString(),
  ]);

  // Update token price tracking
  let tokenPrice = getOrCreateTokenPrice(event.params.reserve);
  tokenPrice.lastUpdatedAt = event.block.timestamp;
  tokenPrice.save();

  // Create price snapshot for repay events
  createPriceSnapshot(
    event.params.reserve,
    tokenPrice.priceUSD,
    event.block.timestamp,
    event.block.number
  );

  updateProtocolMetrics(event.block.timestamp);
}

export function handleAaveWithdraw(event: AaveWithdrawEvent): void {
  log.info("Handling Aave Withdraw event for asset: {}", [
    event.params.reserve.toHexString(),
  ]);

  // Update token price tracking
  let tokenPrice = getOrCreateTokenPrice(event.params.reserve);
  tokenPrice.lastUpdatedAt = event.block.timestamp;
  tokenPrice.save();

  // Create price snapshot if significant withdrawal
  if (event.params.amount.gt(BigInt.fromString("1000000000000000000"))) {
    // > 1 token
    createPriceSnapshot(
      event.params.reserve,
      tokenPrice.priceUSD,
      event.block.timestamp,
      event.block.number
    );
  }

  updateProtocolMetrics(event.block.timestamp);
}
