import {
  BigInt,
  BigDecimal,
  Address,
  Bytes,
  log,
} from "@graphprotocol/graph-ts";
import {
  ReserveInitialized as ReserveInitializedEvent,
  CollateralConfigurationChanged as CollateralConfigurationChangedEvent,
  ReserveBorrowing as ReserveBorrowingEvent,
  ReserveStableRateBorrowing as ReserveStableRateBorrowingEvent,
  ReserveFlashLoaning as ReserveFlashLoaningEvent,
  ReserveActive as ReserveActiveEvent,
  ReserveFrozen as ReserveFrozenEvent,
  ReservePaused as ReservePausedEvent,
  BorrowCapChanged as BorrowCapChangedEvent,
  SupplyCapChanged as SupplyCapChangedEvent,
  ReserveFactorChanged as ReserveFactorChangedEvent,
  LiquidationProtocolFeeChanged as LiquidationProtocolFeeChangedEvent,
  UnbackedMintCapChanged as UnbackedMintCapChangedEvent,
  EModeAssetCategoryChanged as EModeAssetCategoryChangedEvent,
  BorrowableInIsolationChanged as BorrowableInIsolationChangedEvent,
  DebtCeilingChanged as DebtCeilingChangedEvent,
} from "../generated/AavePoolConfigurator/PoolConfigurator";
import {
  AssetConfiguration,
  AssetConfigurationHistory,
} from "../generated/schema";
import { getTokenSymbol, getOrCreateToken } from "./helpers";

// Helper function to get or create AssetConfiguration
function getOrCreateAssetConfiguration(
  assetAddress: Address,
  timestamp: BigInt
): AssetConfiguration {
  let config = AssetConfiguration.load(assetAddress.toHexString());
  if (config == null) {
    config = new AssetConfiguration(assetAddress.toHexString());
    config.asset = assetAddress;
    config.symbol = getTokenSymbol(assetAddress);

    // Initialize with default values
    config.ltv = BigDecimal.fromString("0");
    config.liquidationThreshold = BigDecimal.fromString("0");
    config.liquidationBonus = BigDecimal.fromString("1"); // Default 1.0 (no bonus)
    config.borrowingEnabled = false;
    config.stableRateBorrowingEnabled = false;
    config.flashLoanEnabled = false;
    config.isActive = false;
    config.isFrozen = false;
    config.isPaused = false;
    config.borrowableInIsolation = false;
    config.borrowCap = BigInt.fromI32(0);
    config.supplyCap = BigInt.fromI32(0);
    config.debtCeiling = BigInt.fromI32(0);
    config.reserveFactor = BigInt.fromI32(0);
    config.liquidationProtocolFee = BigInt.fromI32(0);
    config.unbackedMintCap = BigInt.fromI32(0);
    config.eModeCategory = 0;
    config.initializedAt = timestamp;
    config.lastUpdatedAt = timestamp;
  }
  return config;
}

// Helper function to create configuration history record
function createConfigurationHistory(
  assetAddress: Address,
  eventType: string,
  blockNumber: BigInt,
  timestamp: BigInt,
  transactionHash: string,
  logIndex: BigInt
): AssetConfigurationHistory {
  let historyId =
    assetAddress.toHexString() +
    "-" +
    blockNumber.toString() +
    "-" +
    logIndex.toString();
  let history = new AssetConfigurationHistory(historyId);

  history.asset = assetAddress;
  history.eventType = eventType;
  history.blockNumber = blockNumber;
  history.timestamp = timestamp;
  history.transactionHash = Bytes.fromHexString(transactionHash);

  return history;
}

export function handleReserveInitialized(event: ReserveInitializedEvent): void {
  let assetAddress = event.params.asset;
  let config = getOrCreateAssetConfiguration(
    assetAddress,
    event.block.timestamp
  );

  // Set core reserve configuration
  config.aToken = event.params.aToken;
  config.stableDebtToken = event.params.stableDebtToken;
  config.variableDebtToken = event.params.variableDebtToken;
  config.interestRateStrategy = event.params.interestRateStrategyAddress;
  config.isActive = true; // Reserve is active after initialization
  config.lastUpdatedAt = event.block.timestamp;
  config.save();

  // Create history record
  let history = createConfigurationHistory(
    assetAddress,
    "ReserveInitialized",
    event.block.number,
    event.block.timestamp,
    event.transaction.hash.toHexString(),
    event.logIndex
  );
  history.save();

  log.info("Reserve initialized: {} ({})", [
    config.symbol,
    assetAddress.toHexString(),
  ]);
}

export function handleCollateralConfigurationChanged(
  event: CollateralConfigurationChangedEvent
): void {
  let assetAddress = event.params.asset;
  let config = getOrCreateAssetConfiguration(
    assetAddress,
    event.block.timestamp
  );

  // Convert from bps (basis points) to decimal (0-1 scale)
  config.ltv = event.params.ltv
    .toBigDecimal()
    .div(BigDecimal.fromString("10000"));
  config.liquidationThreshold = event.params.liquidationThreshold
    .toBigDecimal()
    .div(BigDecimal.fromString("10000"));
  config.liquidationBonus = event.params.liquidationBonus
    .toBigDecimal()
    .div(BigDecimal.fromString("10000"));
  config.lastUpdatedAt = event.block.timestamp;
  config.save();

  // Create history record with changed values
  let history = createConfigurationHistory(
    assetAddress,
    "CollateralConfigurationChanged",
    event.block.number,
    event.block.timestamp,
    event.transaction.hash.toHexString(),
    event.logIndex
  );
  history.ltv = config.ltv;
  history.liquidationThreshold = config.liquidationThreshold;
  history.liquidationBonus = config.liquidationBonus;
  history.save();

  log.info(
    "Collateral config updated for {}: LTV={}, LT={} → Token.liquidationThreshold synced",
    [
      config.symbol,
      config.ltv.toString(),
      config.liquidationThreshold.toString(),
    ]
  );
}

export function handleReserveBorrowing(event: ReserveBorrowingEvent): void {
  let assetAddress = event.params.asset;
  let config = getOrCreateAssetConfiguration(
    assetAddress,
    event.block.timestamp
  );

  config.borrowingEnabled = event.params.enabled;
  config.lastUpdatedAt = event.block.timestamp;
  config.save();

  let history = createConfigurationHistory(
    assetAddress,
    "ReserveBorrowing",
    event.block.number,
    event.block.timestamp,
    event.transaction.hash.toHexString(),
    event.logIndex
  );
  history.borrowingEnabled = event.params.enabled;
  history.save();

  log.info("Borrowing {} for {}", [
    event.params.enabled ? "enabled" : "disabled",
    config.symbol,
  ]);
}

export function handleReserveStableRateBorrowing(
  event: ReserveStableRateBorrowingEvent
): void {
  let assetAddress = event.params.asset;
  let config = getOrCreateAssetConfiguration(
    assetAddress,
    event.block.timestamp
  );

  config.stableRateBorrowingEnabled = event.params.enabled;
  config.lastUpdatedAt = event.block.timestamp;
  config.save();

  let history = createConfigurationHistory(
    assetAddress,
    "ReserveStableRateBorrowing",
    event.block.number,
    event.block.timestamp,
    event.transaction.hash.toHexString(),
    event.logIndex
  );
  history.stableRateBorrowingEnabled = event.params.enabled;
  history.save();

  log.info("Stable rate borrowing {} for {}", [
    event.params.enabled ? "enabled" : "disabled",
    config.symbol,
  ]);
}

export function handleReserveFlashLoaning(
  event: ReserveFlashLoaningEvent
): void {
  let assetAddress = event.params.asset;
  let config = getOrCreateAssetConfiguration(
    assetAddress,
    event.block.timestamp
  );

  config.flashLoanEnabled = event.params.enabled;
  config.lastUpdatedAt = event.block.timestamp;
  config.save();

  let history = createConfigurationHistory(
    assetAddress,
    "ReserveFlashLoaning",
    event.block.number,
    event.block.timestamp,
    event.transaction.hash.toHexString(),
    event.logIndex
  );
  history.flashLoanEnabled = event.params.enabled;
  history.save();

  log.info("Flash loans {} for {}", [
    event.params.enabled ? "enabled" : "disabled",
    config.symbol,
  ]);
}

export function handleReserveActive(event: ReserveActiveEvent): void {
  let assetAddress = event.params.asset;
  let config = getOrCreateAssetConfiguration(
    assetAddress,
    event.block.timestamp
  );

  config.isActive = event.params.active;
  config.lastUpdatedAt = event.block.timestamp;
  config.save();

  let history = createConfigurationHistory(
    assetAddress,
    "ReserveActive",
    event.block.number,
    event.block.timestamp,
    event.transaction.hash.toHexString(),
    event.logIndex
  );
  history.isActive = event.params.active;
  history.save();

  log.info("Reserve {} for {}", [
    event.params.active ? "activated" : "deactivated",
    config.symbol,
  ]);
}

export function handleReserveFrozen(event: ReserveFrozenEvent): void {
  let assetAddress = event.params.asset;
  let config = getOrCreateAssetConfiguration(
    assetAddress,
    event.block.timestamp
  );

  config.isFrozen = event.params.frozen;
  config.lastUpdatedAt = event.block.timestamp;
  config.save();

  let history = createConfigurationHistory(
    assetAddress,
    "ReserveFrozen",
    event.block.number,
    event.block.timestamp,
    event.transaction.hash.toHexString(),
    event.logIndex
  );
  history.isFrozen = event.params.frozen;
  history.save();

  log.info("Reserve {} for {}", [
    event.params.frozen ? "frozen" : "unfrozen",
    config.symbol,
  ]);
}

export function handleReservePaused(event: ReservePausedEvent): void {
  let assetAddress = event.params.asset;
  let config = getOrCreateAssetConfiguration(
    assetAddress,
    event.block.timestamp
  );

  config.isPaused = event.params.paused;
  config.lastUpdatedAt = event.block.timestamp;
  config.save();

  let history = createConfigurationHistory(
    assetAddress,
    "ReservePaused",
    event.block.number,
    event.block.timestamp,
    event.transaction.hash.toHexString(),
    event.logIndex
  );
  history.isPaused = event.params.paused;
  history.save();

  log.info("Reserve {} for {}", [
    event.params.paused ? "paused" : "unpaused",
    config.symbol,
  ]);
}

export function handleBorrowCapChanged(event: BorrowCapChangedEvent): void {
  let assetAddress = event.params.asset;
  let config = getOrCreateAssetConfiguration(
    assetAddress,
    event.block.timestamp
  );

  config.borrowCap = event.params.newBorrowCap;
  config.lastUpdatedAt = event.block.timestamp;
  config.save();

  let history = createConfigurationHistory(
    assetAddress,
    "BorrowCapChanged",
    event.block.number,
    event.block.timestamp,
    event.transaction.hash.toHexString(),
    event.logIndex
  );
  history.borrowCap = event.params.newBorrowCap;
  history.save();

  log.info("Borrow cap changed for {}: {} -> {}", [
    config.symbol,
    event.params.oldBorrowCap.toString(),
    event.params.newBorrowCap.toString(),
  ]);
}

export function handleSupplyCapChanged(event: SupplyCapChangedEvent): void {
  let assetAddress = event.params.asset;
  let config = getOrCreateAssetConfiguration(
    assetAddress,
    event.block.timestamp
  );

  config.supplyCap = event.params.newSupplyCap;
  config.lastUpdatedAt = event.block.timestamp;
  config.save();

  let history = createConfigurationHistory(
    assetAddress,
    "SupplyCapChanged",
    event.block.number,
    event.block.timestamp,
    event.transaction.hash.toHexString(),
    event.logIndex
  );
  history.supplyCap = event.params.newSupplyCap;
  history.save();

  log.info("Supply cap changed for {}: {} -> {}", [
    config.symbol,
    event.params.oldSupplyCap.toString(),
    event.params.newSupplyCap.toString(),
  ]);
}

export function handleReserveFactorChanged(
  event: ReserveFactorChangedEvent
): void {
  let assetAddress = event.params.asset;
  let config = getOrCreateAssetConfiguration(
    assetAddress,
    event.block.timestamp
  );

  config.reserveFactor = event.params.newReserveFactor;
  config.lastUpdatedAt = event.block.timestamp;
  config.save();

  let history = createConfigurationHistory(
    assetAddress,
    "ReserveFactorChanged",
    event.block.number,
    event.block.timestamp,
    event.transaction.hash.toHexString(),
    event.logIndex
  );
  history.reserveFactor = event.params.newReserveFactor;
  history.save();

  log.info("Reserve factor changed for {}: {} -> {}", [
    config.symbol,
    event.params.oldReserveFactor.toString(),
    event.params.newReserveFactor.toString(),
  ]);
}

export function handleLiquidationProtocolFeeChanged(
  event: LiquidationProtocolFeeChangedEvent
): void {
  let assetAddress = event.params.asset;
  let config = getOrCreateAssetConfiguration(
    assetAddress,
    event.block.timestamp
  );

  config.liquidationProtocolFee = event.params.newFee;
  config.lastUpdatedAt = event.block.timestamp;
  config.save();

  let history = createConfigurationHistory(
    assetAddress,
    "LiquidationProtocolFeeChanged",
    event.block.number,
    event.block.timestamp,
    event.transaction.hash.toHexString(),
    event.logIndex
  );
  history.save();

  log.info("Liquidation protocol fee changed for {}: {} -> {}", [
    config.symbol,
    event.params.oldFee.toString(),
    event.params.newFee.toString(),
  ]);
}

export function handleUnbackedMintCapChanged(
  event: UnbackedMintCapChangedEvent
): void {
  let assetAddress = event.params.asset;
  let config = getOrCreateAssetConfiguration(
    assetAddress,
    event.block.timestamp
  );

  config.unbackedMintCap = event.params.newUnbackedMintCap;
  config.lastUpdatedAt = event.block.timestamp;
  config.save();

  let history = createConfigurationHistory(
    assetAddress,
    "UnbackedMintCapChanged",
    event.block.number,
    event.block.timestamp,
    event.transaction.hash.toHexString(),
    event.logIndex
  );
  history.save();

  log.info("Unbacked mint cap changed for {}: {} -> {}", [
    config.symbol,
    event.params.oldUnbackedMintCap.toString(),
    event.params.newUnbackedMintCap.toString(),
  ]);
}

export function handleEModeAssetCategoryChanged(
  event: EModeAssetCategoryChangedEvent
): void {
  let assetAddress = event.params.asset;
  let config = getOrCreateAssetConfiguration(
    assetAddress,
    event.block.timestamp
  );

  config.eModeCategory = event.params.newCategoryId;
  config.lastUpdatedAt = event.block.timestamp;
  config.save();

  let history = createConfigurationHistory(
    assetAddress,
    "EModeAssetCategoryChanged",
    event.block.number,
    event.block.timestamp,
    event.transaction.hash.toHexString(),
    event.logIndex
  );
  history.save();

  log.info("eMode category changed for {}: {} -> {}", [
    config.symbol,
    event.params.oldCategoryId.toString(),
    event.params.newCategoryId.toString(),
  ]);
}

export function handleBorrowableInIsolationChanged(
  event: BorrowableInIsolationChangedEvent
): void {
  let assetAddress = event.params.asset;
  let config = getOrCreateAssetConfiguration(
    assetAddress,
    event.block.timestamp
  );

  config.borrowableInIsolation = event.params.borrowable;
  config.lastUpdatedAt = event.block.timestamp;
  config.save();

  let history = createConfigurationHistory(
    assetAddress,
    "BorrowableInIsolationChanged",
    event.block.number,
    event.block.timestamp,
    event.transaction.hash.toHexString(),
    event.logIndex
  );
  history.save();

  log.info("Borrowable in isolation {} for {}", [
    event.params.borrowable ? "enabled" : "disabled",
    config.symbol,
  ]);
}

export function handleDebtCeilingChanged(event: DebtCeilingChangedEvent): void {
  let assetAddress = event.params.asset;
  let config = getOrCreateAssetConfiguration(
    assetAddress,
    event.block.timestamp
  );

  config.debtCeiling = event.params.newDebtCeiling;
  config.lastUpdatedAt = event.block.timestamp;
  config.save();

  let history = createConfigurationHistory(
    assetAddress,
    "DebtCeilingChanged",
    event.block.number,
    event.block.timestamp,
    event.transaction.hash.toHexString(),
    event.logIndex
  );
  history.save();

  log.info("Debt ceiling changed for {}: {} -> {}", [
    config.symbol,
    event.params.oldDebtCeiling.toString(),
    event.params.newDebtCeiling.toString(),
  ]);
}
