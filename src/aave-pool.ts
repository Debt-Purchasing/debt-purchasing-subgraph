import { BigInt, BigDecimal, log } from "@graphprotocol/graph-ts";
import {
  Supply as AaveSupplyEvent,
  Borrow as AaveBorrowEvent,
  Repay as AaveRepayEvent,
  Withdraw as AaveWithdrawEvent,
} from "../generated/AavePool/AavePool";
import {
  DebtPosition,
  PositionCollateral,
  PositionDebt,
} from "../generated/schema";
import {
  getOrCreateToken,
  getTokenPriceUSD,
  calculateUSDValue,
  getTokenSymbol,
} from "./helpers";

export function handleAaveSupply(event: AaveSupplyEvent): void {
  log.info("Handling Aave Supply event for user: {} asset: {} amount: {}", [
    event.params.user.toHexString(),
    event.params.reserve.toHexString(),
    event.params.amount.toString(),
  ]);

  // Check if this is one of our debt positions
  let position = DebtPosition.load(event.params.onBehalfOf.toHexString());
  if (position != null) {
    // Update collateral for this position
    let collateralId = position.id + "-" + event.params.reserve.toHexString();
    let collateral = PositionCollateral.load(collateralId);
    if (collateral == null) {
      collateral = new PositionCollateral(collateralId);
      collateral.position = position.id;
      collateral.token = event.params.reserve.toHexString();
      collateral.amount = BigDecimal.fromString("0");
    }

    // Update amount (add supply)
    let amountDecimal = event.params.amount.toBigDecimal().div(
      BigDecimal.fromString(
        BigInt.fromString("10")
          .pow(getOrCreateToken(event.params.reserve).decimals as u8)
          .toString()
      )
    );
    collateral.amount = collateral.amount.plus(amountDecimal);
    collateral.lastUpdatedAt = event.block.timestamp;
    collateral.save();

    // Log supply details
    let tokenSymbol = getTokenSymbol(event.params.reserve);
    getTokenPriceUSD(event.params.reserve);
    log.info(
      "Supply processed: {} {} (${}) added as collateral to position {}",
      [amountDecimal.toString(), tokenSymbol, position.id]
    );
  }

  // updateProtocolMetrics(event.block.timestamp);
}

export function handleAaveBorrow(event: AaveBorrowEvent): void {
  log.info("Handling Aave Borrow event for user: {} asset: {} amount: {}", [
    event.params.user.toHexString(),
    event.params.reserve.toHexString(),
    event.params.amount.toString(),
  ]);

  // Check if this is one of our debt positions
  let position = DebtPosition.load(event.params.onBehalfOf.toHexString());
  if (position != null) {
    // Update debt for this position
    let debtId =
      position.id +
      "-" +
      event.params.reserve.toHexString() +
      "-" +
      event.params.interestRateMode.toString();
    let debt = PositionDebt.load(debtId);
    if (debt == null) {
      debt = new PositionDebt(debtId);
      debt.position = position.id;
      debt.token = event.params.reserve.toHexString();
      debt.amount = BigDecimal.fromString("0");
      debt.interestRateMode = event.params.interestRateMode;
    }

    // Update amount (add borrow)
    let amountDecimal = event.params.amount.toBigDecimal().div(
      BigDecimal.fromString(
        BigInt.fromString("10")
          .pow(getOrCreateToken(event.params.reserve).decimals as u8)
          .toString()
      )
    );
    debt.amount = debt.amount.plus(amountDecimal);
    debt.lastUpdatedAt = event.block.timestamp;
    debt.save();

    // Log borrow details
    let tokenSymbol = getTokenSymbol(event.params.reserve);
    let rateMode = event.params.interestRateMode.equals(BigInt.fromI32(1))
      ? "stable"
      : "variable";
    log.info(
      "Borrow processed: {} {} (${}) added as {} rate debt to position {}",
      [amountDecimal.toString(), tokenSymbol, rateMode, position.id]
    );
  }

  // updateProtocolMetrics(event.block.timestamp);
}

export function handleAaveRepay(event: AaveRepayEvent): void {
  log.info("Handling Aave Repay event for user: {} asset: {} amount: {}", [
    event.params.user.toHexString(),
    event.params.reserve.toHexString(),
    event.params.amount.toString(),
  ]);

  // Check if this is one of our debt positions
  let position = DebtPosition.load(event.params.user.toHexString());
  if (position != null) {
    // Find and update debt for this position
    // Note: We need to check both stable and variable rate modes
    let amountDecimal = event.params.amount.toBigDecimal().div(
      BigDecimal.fromString("1000000000000000000") // 18 decimals
    );
    let totalRepaidUSD = BigDecimal.fromString("0");

    for (let rateMode = 1; rateMode <= 2; rateMode++) {
      let debtId =
        position.id +
        "-" +
        event.params.reserve.toHexString() +
        "-" +
        rateMode.toString();
      let debt = PositionDebt.load(debtId);
      if (debt != null && debt.amount.gt(BigDecimal.fromString("0"))) {
        // Calculate how much to repay from this debt
        let repayAmount = amountDecimal;
        if (repayAmount.gt(debt.amount)) {
          repayAmount = debt.amount;
        }

        // Update debt amount
        debt.amount = debt.amount.minus(repayAmount);
        if (debt.amount.lt(BigDecimal.fromString("0"))) {
          debt.amount = BigDecimal.fromString("0");
        }
        debt.lastUpdatedAt = event.block.timestamp;

        totalRepaidUSD = totalRepaidUSD.plus(
          calculateUSDValue(event.params.reserve, repayAmount)
        );
        debt.save();

        // Reduce remaining amount to repay
        amountDecimal = amountDecimal.minus(repayAmount);
        if (amountDecimal.le(BigDecimal.fromString("0"))) {
          break; // All repaid
        }
      }
    }

    // Log repay details
    let tokenSymbol = getTokenSymbol(event.params.reserve);
    log.info("Repay processed: {} {} (${}) debt reduced for position {}", [
      event.params.amount
        .toBigDecimal()
        .div(BigDecimal.fromString("1000000000000000000"))
        .toString(),
      tokenSymbol,
      totalRepaidUSD.toString(),
      position.id,
    ]);
  }

  // updateProtocolMetrics(event.block.timestamp);
}

export function handleAaveWithdraw(event: AaveWithdrawEvent): void {
  log.info("Handling Aave Withdraw event for user: {} asset: {} amount: {}", [
    event.params.user.toHexString(),
    event.params.reserve.toHexString(),
    event.params.amount.toString(),
  ]);

  // Check if this is one of our debt positions
  let position = DebtPosition.load(event.params.user.toHexString());
  if (position != null) {
    // Update collateral for this position (subtract withdrawal)
    let collateralId = position.id + "-" + event.params.reserve.toHexString();
    let collateral = PositionCollateral.load(collateralId);
    if (collateral != null) {
      let amountDecimal = event.params.amount.toBigDecimal().div(
        BigDecimal.fromString("1000000000000000000") // 18 decimals
      );
      let withdrawnUSD = calculateUSDValue(event.params.reserve, amountDecimal);

      collateral.amount = collateral.amount.minus(amountDecimal);
      if (collateral.amount.lt(BigDecimal.fromString("0"))) {
        collateral.amount = BigDecimal.fromString("0");
      }
      collateral.lastUpdatedAt = event.block.timestamp;

      collateral.save();

      // Log withdraw details
      let tokenSymbol = getTokenSymbol(event.params.reserve);
      log.info(
        "Withdraw processed: {} {} (${}) removed from collateral of position {}",
        [
          amountDecimal.toString(),
          tokenSymbol,
          withdrawnUSD.toString(),
          position.id,
        ]
      );
    }
  }

  // updateProtocolMetrics(event.block.timestamp);
}
