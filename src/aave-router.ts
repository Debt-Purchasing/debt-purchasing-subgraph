import { BigInt, BigDecimal, Address, ethereum } from "@graphprotocol/graph-ts";
import {
  CreateDebt,
  TransferDebtOwnership,
  CancelCurrentDebtOrders,
  ExecuteFullSaleOrder,
  ExecutePartialSellOrder,
} from "../generated/AaveRouter/AaveRouter";
import {
  User,
  DebtPosition,
  Transaction,
  ProtocolMetrics,
  FullSaleOrderExecution,
  PartialOrderExecution,
} from "../generated/schema";

// Constants
const ZERO_BI = BigInt.fromI32(0);
const ONE_BI = BigInt.fromI32(1);
const ZERO_BD = BigDecimal.fromString("0");

// Helper function to get or create User
function getOrCreateUser(address: Address): User {
  let user = User.load(address.toHexString());
  if (user == null) {
    user = new User(address.toHexString());
    user.totalPositions = ZERO_BI;
    user.totalOrdersExecuted = ZERO_BI;
    user.totalVolumeTraded = ZERO_BD;
    user.save();
  }
  return user;
}

// Helper function to get or create ProtocolMetrics
function getOrCreateProtocolMetrics(): ProtocolMetrics {
  let metrics = ProtocolMetrics.load("protocol");
  if (metrics == null) {
    metrics = new ProtocolMetrics("protocol");
    metrics.totalPositions = ZERO_BI;
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

export function handleCreateDebt(event: CreateDebt): void {
  // Create transaction record
  createTransaction(event);

  // Get or create user
  let user = getOrCreateUser(event.params.owner);
  user.totalPositions = user.totalPositions.plus(ONE_BI);
  user.save();

  // Create debt position
  let position = new DebtPosition(event.params.debt.toHexString());
  position.owner = user.id;
  position.nonce = ZERO_BI;
  position.lastUpdatedAt = event.block.timestamp;
  position.save();

  // // Update protocol metrics
  // let metrics = getOrCreateProtocolMetrics();
  // metrics.totalPositions = metrics.totalPositions.plus(ONE_BI);
  // metrics.lastUpdatedAt = event.block.timestamp;
  // metrics.save();
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
      oldUser.save();
    }

    // Update new owner
    let newUser = getOrCreateUser(event.params.newOwner);
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
      user.save();
    }
  }
}

export function handleExecuteFullSaleOrder(event: ExecuteFullSaleOrder): void {
  createTransaction(event);

  let position = DebtPosition.load(event.params.debt.toHexString());
  if (position != null) {
    // Get current seller before updating position
    let seller = User.load(position.owner);

    // Update buyer
    let buyer = getOrCreateUser(event.params.buyer);
    buyer.totalOrdersExecuted = buyer.totalOrdersExecuted.plus(ONE_BI);
    buyer.save();

    // Update seller if exists
    if (seller != null) {
      seller.save();
    }

    // Update position ownership - this transfers the entire position
    position.owner = buyer.id;
    position.nonce = event.params.debtNonce;
    position.lastUpdatedAt = event.block.timestamp;
    position.save();

    // Create full sale execution record
    let execution = new FullSaleOrderExecution(
      event.transaction.hash.toHexString()
    );
    execution.position = position.id;
    execution.buyer = buyer.id;
    execution.seller = seller ? seller.id : buyer.id; // Fallback if seller not found
    execution.debtNonce = event.params.debtNonce;
    execution.gasUsed = ZERO_BI; // Will be filled by actual gas from transaction receipt if available
    execution.gasPriceGwei = event.transaction.gasPrice.toBigDecimal();
    execution.executionTime = event.block.timestamp;
    execution.blockNumber = event.block.number;
    execution.save();
  }
}

export function handleExecutePartialSellOrder(
  event: ExecutePartialSellOrder
): void {
  createTransaction(event);

  let position = DebtPosition.load(event.params.debt.toHexString());
  if (position != null) {
    // Get seller (position owner remains unchanged in partial execution)
    let seller = User.load(position.owner);

    // Update buyer
    let buyer = getOrCreateUser(event.params.buyer);
    buyer.totalOrdersExecuted = buyer.totalOrdersExecuted.plus(ONE_BI);
    buyer.save();

    // Update seller if exists
    if (seller != null) {
      seller.save();
    }

    // Update position nonce but ownership stays the same
    position.nonce = event.params.debtNonce;
    position.lastUpdatedAt = event.block.timestamp;
    position.save();

    // Create partial order execution record
    let execution = new PartialOrderExecution(
      event.transaction.hash.toHexString()
    );
    execution.position = position.id;
    execution.buyer = buyer.id;
    execution.seller = seller ? seller.id : position.owner; // Fallback to position owner
    execution.debtNonce = event.params.debtNonce;
    execution.gasUsed = ZERO_BI; // Will be filled by actual gas from transaction receipt if available
    execution.gasPriceGwei = event.transaction.gasPrice.toBigDecimal();
    execution.executionTime = event.block.timestamp;
    execution.blockNumber = event.block.number;
    execution.save();
  }
}
