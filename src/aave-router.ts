import {
  BigInt,
  BigDecimal,
  Address,
  Bytes,
  ethereum,
} from "@graphprotocol/graph-ts";
import {
  CreateDebt,
  TransferDebtOwnership,
  CancelCurrentDebtOrders,
  Supply,
  Borrow,
  Withdraw,
  Repay,
  ExecuteFullSaleOrder,
  ExecutePartialSellOrder,
} from "../generated/AaveRouter/AaveRouter";
import {
  User,
  DebtPosition,
  Order,
  OrderExecution,
  Transaction,
  ProtocolMetrics,
  PositionCollateral,
  PositionDebt,
  TokenPrice,
  PositionSnapshot,
} from "../generated/schema";
import { AaveDebt as AaveDebtTemplate } from "../generated/templates";
import {
  initializePricesFromAaveOracle,
  fetchPriceFromAaveOracle,
  fetchTestnetPriceFallback,
  createPriceSnapshot,
  updateDynamicPrices,
} from "./aave-oracle";

// Constants
const ZERO_BI = BigInt.fromI32(0);
const ONE_BI = BigInt.fromI32(1);
const ZERO_BD = BigDecimal.fromString("0");
const ONE_BD = BigDecimal.fromString("1");
const LIQUIDATION_THRESHOLD = BigDecimal.fromString("1.05"); // 5% buffer above liquidation

// Helper function to get or create User
function getOrCreateUser(address: Address): User {
  let user = User.load(address.toHexString());
  if (user == null) {
    user = new User(address.toHexString());
    user.totalPositions = ZERO_BI;
    user.totalOrdersCreated = ZERO_BI;
    user.totalOrdersExecuted = ZERO_BI;
    user.totalVolumeTraded = ZERO_BD;
    user.createdAt = BigInt.fromI32(0); // Will be set on first interaction
    user.lastActiveAt = BigInt.fromI32(0);
    user.save();
  }
  return user;
}

// Helper function to get or create TokenPrice
function getOrCreateTokenPrice(asset: Address): TokenPrice {
  let tokenPrice = TokenPrice.load(asset.toHexString());
  if (tokenPrice == null) {
    tokenPrice = new TokenPrice(asset.toHexString());
    tokenPrice.symbol = "UNKNOWN";
    tokenPrice.decimals = 18;
    tokenPrice.priceUSD = ZERO_BD;
    tokenPrice.lastUpdatedAt = ZERO_BI;
    tokenPrice.liquidationThreshold = BigDecimal.fromString("0.8"); // Default 80%
    tokenPrice.ltv = BigDecimal.fromString("0.75"); // Default 75%
    tokenPrice.save();
  }
  return tokenPrice;
}

// Helper function to calculate Health Factor
function calculateHealthFactor(position: DebtPosition): BigDecimal {
  // HF = (Collateral * LiquidationThreshold) / TotalDebt
  if (position.totalDebtUSD.equals(ZERO_BD)) {
    return BigDecimal.fromString("999999"); // Very high HF when no debt
  }

  let weightedCollateral = position.totalCollateralUSD.times(
    position.liquidationThreshold
  );
  return weightedCollateral.div(position.totalDebtUSD);
}

// Helper function to determine risk level based on Health Factor
function getRiskLevel(healthFactor: BigDecimal): string {
  if (healthFactor.lt(BigDecimal.fromString("1.1"))) {
    return "CRITICAL"; // HF < 1.1
  } else if (healthFactor.lt(BigDecimal.fromString("1.3"))) {
    return "HIGH"; // 1.1 <= HF < 1.3
  } else if (healthFactor.lt(BigDecimal.fromString("2.0"))) {
    return "MEDIUM"; // 1.3 <= HF < 2.0
  } else {
    return "LOW"; // HF >= 2.0
  }
}

// Helper function to estimate time to liquidation
function estimateTimeToLiquidation(
  healthFactor: BigDecimal,
  currentDebtUSD: BigDecimal
): BigInt | null {
  if (healthFactor.gt(LIQUIDATION_THRESHOLD)) {
    // Rough estimation based on typical interest rates (5% APY = ~0.000000158 per second)
    let interestRatePerSecond = BigDecimal.fromString("0.000000158");
    let debtGrowthToLiquidation = currentDebtUSD.times(
      healthFactor.minus(ONE_BD)
    );
    let timeInSeconds = debtGrowthToLiquidation.div(
      currentDebtUSD.times(interestRatePerSecond)
    );

    if (timeInSeconds.lt(BigDecimal.fromString("31536000"))) {
      // Less than 1 year
      return BigInt.fromString(timeInSeconds.toString().split(".")[0]);
    }
  }
  return null;
}

// Helper function to update position health metrics
function updatePositionHealth(position: DebtPosition, timestamp: BigInt): void {
  // Calculate new health factor
  position.healthFactor = calculateHealthFactor(position);

  // Update risk level
  position.riskLevel = getRiskLevel(position.healthFactor);

  // Estimate time to liquidation
  position.timeToLiquidation = estimateTimeToLiquidation(
    position.healthFactor,
    position.totalDebtUSD
  );

  // Calculate net equity
  position.netEquityUSD = position.totalCollateralUSD.minus(
    position.totalDebtUSD
  );

  // Update timestamp
  position.lastUpdatedAt = timestamp;

  position.save();

  // Create position snapshot for historical tracking
  createPositionSnapshot(position, timestamp);
}

// Helper function to create position snapshot
function createPositionSnapshot(
  position: DebtPosition,
  timestamp: BigInt
): void {
  let snapshotId = position.id + "-" + timestamp.toString();
  let snapshot = new PositionSnapshot(snapshotId);

  snapshot.position = position.id;
  snapshot.healthFactor = position.healthFactor;
  snapshot.totalCollateralUSD = position.totalCollateralUSD;
  snapshot.totalDebtUSD = position.totalDebtUSD;
  snapshot.netEquityUSD = position.netEquityUSD;
  snapshot.timestamp = timestamp;
  snapshot.blockNumber = ZERO_BI; // Will be set by caller if needed

  snapshot.save();
}

// Helper function to get or create ProtocolMetrics
function getOrCreateProtocolMetrics(): ProtocolMetrics {
  let metrics = ProtocolMetrics.load("protocol");
  if (metrics == null) {
    metrics = new ProtocolMetrics("protocol");
    metrics.totalPositions = ZERO_BI;
    metrics.totalActiveOrders = ZERO_BI;
    metrics.totalVolumeUSD = ZERO_BD;
    metrics.totalUsers = ZERO_BI;
    metrics.lastUpdatedAt = ZERO_BI;
    metrics.save();
  }
  return metrics;
}

// Helper function to create Transaction entity
function createTransaction(event: ethereum.Event): Transaction {
  let transaction = new Transaction(event.transaction.hash.toHexString());
  transaction.blockNumber = event.block.number;
  transaction.timestamp = event.block.timestamp;
  transaction.gasUsed = ZERO_BI; // TODO: Get actual gas used from receipt
  transaction.gasPrice = event.transaction.gasPrice.toBigDecimal();
  transaction.from = event.transaction.from;
  transaction.to = event.transaction.to
    ? event.transaction.to!
    : Address.zero();
  transaction.save();
  return transaction;
}

// Helper function to initialize protocol if needed
function initializeProtocol(): void {
  let protocol = ProtocolMetrics.load("protocol");
  if (protocol == null) {
    protocol = new ProtocolMetrics("protocol");
    protocol.totalPositions = ZERO_BI;
    protocol.totalActiveOrders = ZERO_BI;
    protocol.totalVolumeUSD = ZERO_BD;
    protocol.totalUsers = ZERO_BI;
    protocol.lastUpdatedAt = BigInt.fromI32(1640995200);
    protocol.save();

    // Initialize Oracle prices when protocol is first initialized
    initializePricesFromAaveOracle();
  }
}

export function handleCreateDebt(event: CreateDebt): void {
  // Create transaction record
  createTransaction(event);

  // Get or create user
  let user = getOrCreateUser(event.params.owner);
  if (user.createdAt.equals(ZERO_BI)) {
    user.createdAt = event.block.timestamp;
  }
  user.lastActiveAt = event.block.timestamp;
  user.totalPositions = user.totalPositions.plus(ONE_BI);
  user.save();

  // Create debt position
  let position = new DebtPosition(event.params.debt.toHexString());
  position.owner = user.id;
  position.nonce = ZERO_BI;
  position.totalCollateralUSD = ZERO_BD;
  position.totalDebtUSD = ZERO_BD;
  position.healthFactor = BigDecimal.fromString("999999"); // Very high initial HF
  position.liquidationThreshold = BigDecimal.fromString("0.8"); // Default 80%
  position.maxLTV = BigDecimal.fromString("0.75"); // Default 75%
  position.riskLevel = "LOW";
  position.timeToLiquidation = null;
  position.netEquityUSD = ZERO_BD;
  position.totalPnL = ZERO_BD;
  position.createdAt = event.block.timestamp;
  position.lastUpdatedAt = event.block.timestamp;
  position.save();

  // Update protocol metrics
  let metrics = getOrCreateProtocolMetrics();
  metrics.totalPositions = metrics.totalPositions.plus(ONE_BI);
  metrics.lastUpdatedAt = event.block.timestamp;
  metrics.save();

  // Start tracking this debt contract
  AaveDebtTemplate.create(event.params.debt);
}

export function handleTransferDebtOwnership(
  event: TransferDebtOwnership
): void {
  createTransaction(event);

  let position = DebtPosition.load(event.params.debt.toHexString());
  if (position != null) {
    // Update old owner
    let oldUser = User.load(position.owner);
    if (oldUser != null) {
      oldUser.lastActiveAt = event.block.timestamp;
      oldUser.save();
    }

    // Update new owner
    let newUser = getOrCreateUser(event.params.newOwner);
    newUser.lastActiveAt = event.block.timestamp;
    newUser.totalPositions = newUser.totalPositions.plus(ONE_BI);
    newUser.save();

    // Update position
    position.owner = newUser.id;
    position.nonce = position.nonce.plus(ONE_BI);
    position.lastUpdatedAt = event.block.timestamp;
    position.save();
  }
}

export function handleCancelCurrentDebtOrders(
  event: CancelCurrentDebtOrders
): void {
  createTransaction(event);

  let position = DebtPosition.load(event.params.debt.toHexString());
  if (position != null) {
    position.nonce = position.nonce.plus(ONE_BI);
    position.lastUpdatedAt = event.block.timestamp;
    position.save();

    // Update user activity
    let user = User.load(position.owner);
    if (user != null) {
      user.lastActiveAt = event.block.timestamp;
      user.save();
    }
  }
}

export function handleSupply(event: Supply): void {
  createTransaction(event);

  // Update dynamic prices for UI testing
  updateDynamicPrices(event.block.timestamp);

  let position = DebtPosition.load(event.params.debt.toHexString());
  if (position != null) {
    position.lastUpdatedAt = event.block.timestamp;

    // Recalculate health factor with potentially new prices
    updatePositionHealth(position, event.block.timestamp);

    // Update user activity
    let user = User.load(position.owner);
    if (user != null) {
      user.lastActiveAt = event.block.timestamp;
      user.save();
    }

    // TODO: Update collateral tracking
    // This would require calling Aave contracts to get updated balances
  }
}

export function handleBorrow(event: Borrow): void {
  createTransaction(event);

  // Update dynamic prices for UI testing
  updateDynamicPrices(event.block.timestamp);

  let position = DebtPosition.load(event.params.debt.toHexString());
  if (position != null) {
    position.lastUpdatedAt = event.block.timestamp;

    // Recalculate health factor with potentially new prices
    updatePositionHealth(position, event.block.timestamp);

    // Update user activity
    let user = User.load(position.owner);
    if (user != null) {
      user.lastActiveAt = event.block.timestamp;
      user.save();
    }

    // TODO: Update debt tracking
    // This would require calling Aave contracts to get updated balances
  }
}

export function handleWithdraw(event: Withdraw): void {
  createTransaction(event);

  // Update dynamic prices for UI testing
  updateDynamicPrices(event.block.timestamp);

  let position = DebtPosition.load(event.params.debt.toHexString());
  if (position != null) {
    position.lastUpdatedAt = event.block.timestamp;

    // Recalculate health factor with potentially new prices
    updatePositionHealth(position, event.block.timestamp);

    // Update user activity
    let user = User.load(position.owner);
    if (user != null) {
      user.lastActiveAt = event.block.timestamp;
      user.save();
    }

    // TODO: Update collateral tracking
  }
}

export function handleRepay(event: Repay): void {
  createTransaction(event);

  // Update dynamic prices for UI testing
  updateDynamicPrices(event.block.timestamp);

  let position = DebtPosition.load(event.params.debt.toHexString());
  if (position != null) {
    position.lastUpdatedAt = event.block.timestamp;

    // Recalculate health factor with potentially new prices
    updatePositionHealth(position, event.block.timestamp);

    // Update user activity
    let user = User.load(position.owner);
    if (user != null) {
      user.lastActiveAt = event.block.timestamp;
      user.save();
    }

    // TODO: Update debt tracking
  }
}

export function handleExecuteFullSaleOrder(event: ExecuteFullSaleOrder): void {
  createTransaction(event);

  let position = DebtPosition.load(event.params.debt.toHexString());
  if (position != null) {
    // Update seller
    let seller = User.load(position.owner);
    if (seller != null) {
      seller.lastActiveAt = event.block.timestamp;
      seller.save();
    }

    // Update buyer
    let buyer = getOrCreateUser(event.params.buyer);
    buyer.lastActiveAt = event.block.timestamp;
    buyer.totalOrdersExecuted = buyer.totalOrdersExecuted.plus(ONE_BI);
    buyer.save();

    // Update position ownership
    position.owner = buyer.id;
    position.nonce = event.params.debtNonce;
    position.lastUpdatedAt = event.block.timestamp;
    position.save();

    // Create order execution record
    let execution = new OrderExecution(event.transaction.hash.toHexString());
    execution.position = position.id;
    execution.buyer = buyer.id;
    execution.executionPrice = ZERO_BD; // TODO: Calculate from transaction
    execution.actualProfit = ZERO_BD; // TODO: Calculate
    execution.premiumPaid = ZERO_BD; // TODO: Calculate
    execution.gasUsed = ZERO_BI; // TODO: Get actual gas used
    execution.gasPriceGwei = event.transaction.gasPrice.toBigDecimal();
    execution.executionTime = event.block.timestamp;
    execution.blockNumber = event.block.number;
    execution.strategy = "FULL_CLEANUP";
    execution.save();
  }
}

export function handleExecutePartialSellOrder(
  event: ExecutePartialSellOrder
): void {
  createTransaction(event);

  let position = DebtPosition.load(event.params.debt.toHexString());
  if (position != null) {
    // Update seller
    let seller = User.load(position.owner);
    if (seller != null) {
      seller.lastActiveAt = event.block.timestamp;
      seller.save();
    }

    // Update buyer
    let buyer = getOrCreateUser(event.params.buyer);
    buyer.lastActiveAt = event.block.timestamp;
    buyer.totalOrdersExecuted = buyer.totalOrdersExecuted.plus(ONE_BI);
    buyer.save();

    // Update position
    position.nonce = event.params.debtNonce;
    position.lastUpdatedAt = event.block.timestamp;
    position.save();

    // Create order execution record
    let execution = new OrderExecution(event.transaction.hash.toHexString());
    execution.position = position.id;
    execution.buyer = buyer.id;
    execution.executionPrice = ZERO_BD; // TODO: Calculate from transaction
    execution.actualProfit = ZERO_BD; // TODO: Calculate
    execution.premiumPaid = ZERO_BD; // TODO: Calculate
    execution.gasUsed = ZERO_BI; // TODO: Get actual gas used
    execution.gasPriceGwei = event.transaction.gasPrice.toBigDecimal();
    execution.executionTime = event.block.timestamp;
    execution.blockNumber = event.block.number;
    execution.strategy = "STRATEGIC";
    execution.save();
  }
}
