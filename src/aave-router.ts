import { BigDecimal, BigInt } from "@graphprotocol/graph-ts";
import {
  CreateDebt,
  TransferDebtOwnership,
  CancelCurrentDebtOrders,
  ExecuteFullSaleOrder,
  ExecutePartialSellOrder,
  CancelOrder,
} from "../generated/AaveRouter/AaveRouter";
import {
  DebtPosition,
  FullOrderExecution,
  PartialOrderExecution,
  CancelledOrder,
  User,
  ProtocolMetrics,
} from "../generated/schema";

// Constants
const ZERO_BI = BigInt.fromI32(0);
const ONE_BI = BigInt.fromI32(1);

export function handleCreateDebt(event: CreateDebt): void {
  let user = User.load(event.params.owner.toHexString());
  if (user == null) {
    user = new User(event.params.owner.toHexString());
    user.lastUpdatedAt = event.block.timestamp;
    user.nonce = BigInt.fromI32(1);
    user.totalPositions = BigInt.fromI32(1);
    user.totalOrdersExecuted = ZERO_BI;
    user.totalVolumeUSD = BigDecimal.fromString("0");
    user.save();
  } else {
    user.nonce = user.nonce.plus(ONE_BI);
    user.totalPositions = user.totalPositions.plus(ONE_BI);
    user.lastUpdatedAt = event.block.timestamp;
    user.save();
  }

  // Create debt position
  let position = new DebtPosition(event.params.debt.toHexString());
  position.owner = event.params.owner;
  position.nonce = ZERO_BI;
  position.createdAt = event.block.timestamp;
  position.lastUpdatedAt = event.block.timestamp;
  position.save();

  let protocol = ProtocolMetrics.load("protocol");
  if (protocol == null) {
    protocol = new ProtocolMetrics("protocol");
    protocol.totalUsers = ONE_BI;
    protocol.totalPositions = ONE_BI;
    protocol.fullOrdersUSD = BigDecimal.fromString("0");
    protocol.partialOrdersUSD = BigDecimal.fromString("0");
    protocol.lastUpdatedAt = event.block.timestamp;
    protocol.save();
  } else {
    protocol.totalPositions = protocol.totalPositions.plus(ONE_BI);
    protocol.totalUsers = protocol.totalUsers.plus(ONE_BI);
    protocol.lastUpdatedAt = event.block.timestamp;
    protocol.save();
  }
}

export function handleTransferDebtOwnership(
  event: TransferDebtOwnership
): void {
  let position = DebtPosition.load(event.params.debt.toHexString());
  if (position != null) {
    let oldOwnerAddress = position.owner;
    position.owner = event.params.newOwner;
    position.lastUpdatedAt = event.block.timestamp;
    position.save();

    let newOwner = User.load(event.params.newOwner.toHexString());
    if (newOwner == null) {
      newOwner = new User(event.params.newOwner.toHexString());
      newOwner.nonce = ZERO_BI;
      newOwner.totalPositions = BigInt.fromI32(1);
      newOwner.totalVolumeUSD = BigDecimal.fromString("0");
      newOwner.lastUpdatedAt = event.block.timestamp;
      newOwner.save();
    } else {
      newOwner.totalPositions = newOwner.totalPositions.plus(ONE_BI);
      newOwner.lastUpdatedAt = event.block.timestamp;
      newOwner.save();
    }

    let oldOwner = User.load(oldOwnerAddress.toHexString());
    if (oldOwner != null) {
      oldOwner.totalPositions = oldOwner.totalPositions.minus(ONE_BI);
      oldOwner.lastUpdatedAt = event.block.timestamp;
      oldOwner.save();
    }
  }
}

export function handleCancelCurrentDebtOrders(
  event: CancelCurrentDebtOrders
): void {
  let position = DebtPosition.load(event.params.debt.toHexString());
  if (position != null) {
    position.nonce = position.nonce.plus(ONE_BI);
    position.lastUpdatedAt = event.block.timestamp;
    position.save();
  }
}

export function handleCancelOrder(event: CancelOrder): void {
  let cancelledOrder = new CancelledOrder(event.params.titleHash.toHexString());
  cancelledOrder.titleHash = event.params.titleHash;
  cancelledOrder.cancelledAt = event.block.timestamp;
  cancelledOrder.save();
}

export function handleExecuteFullSaleOrder(event: ExecuteFullSaleOrder): void {
  // Create full sale execution record
  let execution = new FullOrderExecution(event.transaction.hash.toHexString());
  execution.titleHash = event.params.titleHash;
  execution.buyer = event.params.buyer;
  execution.blockTimestamp = event.block.timestamp;
  execution.blockNumber = event.block.number;
  execution.usdValue = BigDecimal.fromString(
    event.params.baseValue.toString()
  ).div(BigDecimal.fromString("100000000"));
  execution.save();

  let position = DebtPosition.load(event.params.debt.toHexString());
  if (position != null) {
    position.nonce = position.nonce.plus(ONE_BI);
    position.owner = event.params.buyer;
    position.lastUpdatedAt = event.block.timestamp;
    position.save();
  }

  let newOwner = User.load(event.params.buyer.toHexString());
  if (newOwner == null) {
    newOwner = new User(event.params.buyer.toHexString());
    newOwner.lastUpdatedAt = event.block.timestamp;
    newOwner.nonce = ZERO_BI;
    newOwner.totalPositions = ONE_BI;
    newOwner.totalOrdersExecuted = ONE_BI;
    newOwner.totalVolumeUSD = BigDecimal.fromString(
      event.params.baseValue.toString()
    ).div(BigDecimal.fromString("100000000"));
    newOwner.save();
  } else {
    newOwner.totalPositions = newOwner.totalPositions.plus(ONE_BI);
    newOwner.lastUpdatedAt = event.block.timestamp;
    newOwner.totalOrdersExecuted = newOwner.totalOrdersExecuted.plus(ONE_BI);
    newOwner.totalVolumeUSD = newOwner.totalVolumeUSD.plus(
      BigDecimal.fromString(event.params.baseValue.toString()).div(
        BigDecimal.fromString("100000000")
      )
    );
    newOwner.save();
  }

  let oldOwner = User.load(event.params.seller.toHexString());
  if (oldOwner != null) {
    oldOwner.totalPositions = oldOwner.totalPositions.minus(ONE_BI);
    oldOwner.lastUpdatedAt = event.block.timestamp;
    oldOwner.totalOrdersExecuted = oldOwner.totalOrdersExecuted.plus(ONE_BI);
    oldOwner.totalVolumeUSD = oldOwner.totalVolumeUSD.plus(
      BigDecimal.fromString(event.params.baseValue.toString()).div(
        BigDecimal.fromString("100000000")
      )
    );
    oldOwner.save();
  }

  let protocol = ProtocolMetrics.load("protocol");
  if (protocol != null) {
    protocol.fullOrdersUSD = protocol.fullOrdersUSD.plus(
      BigDecimal.fromString(event.params.baseValue.toString()).div(
        BigDecimal.fromString("100000000")
      )
    );
    protocol.save();
  }
}

export function handleExecutePartialSellOrder(
  event: ExecutePartialSellOrder
): void {
  // Create partial order execution record
  let execution = new PartialOrderExecution(
    event.transaction.hash.toHexString()
  );
  execution.titleHash = event.params.titleHash;
  execution.buyer = event.params.buyer;
  execution.blockTimestamp = event.block.timestamp;
  execution.blockNumber = event.block.number;
  execution.save();

  let seller = User.load(event.params.seller.toHexString());
  if (seller != null) {
    seller.totalOrdersExecuted = seller.totalOrdersExecuted.plus(ONE_BI);
    seller.lastUpdatedAt = event.block.timestamp;
    seller.totalVolumeUSD = seller.totalVolumeUSD.plus(
      BigDecimal.fromString(event.params.baseValue.toString()).div(
        BigDecimal.fromString("100000000")
      )
    );
    seller.save();
  }

  let buyer = User.load(event.params.buyer.toHexString());
  if (buyer == null) {
    buyer = new User(event.params.buyer.toHexString());
    buyer.lastUpdatedAt = event.block.timestamp;
    buyer.nonce = ZERO_BI;
    buyer.totalPositions = ZERO_BI;
    buyer.totalOrdersExecuted = ONE_BI;
    buyer.totalVolumeUSD = BigDecimal.fromString(
      event.params.baseValue.toString()
    ).div(BigDecimal.fromString("100000000"));
    buyer.save();
  } else {
    buyer.totalOrdersExecuted = buyer.totalOrdersExecuted.plus(ONE_BI);
    buyer.lastUpdatedAt = event.block.timestamp;
    buyer.totalVolumeUSD = buyer.totalVolumeUSD.plus(
      BigDecimal.fromString(event.params.baseValue.toString()).div(
        BigDecimal.fromString("100000000")
      )
    );
    buyer.save();
  }

  let protocol = ProtocolMetrics.load("protocol");
  if (protocol != null) {
    protocol.partialOrdersUSD = protocol.partialOrdersUSD.plus(
      BigDecimal.fromString(event.params.baseValue.toString()).div(
        BigDecimal.fromString("100000000")
      )
    );
    protocol.save();
  }
}
