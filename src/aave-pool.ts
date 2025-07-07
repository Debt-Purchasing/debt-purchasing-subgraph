import { BigInt, BigDecimal } from "@graphprotocol/graph-ts";
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
  ProtocolCollateral,
  ProtocolDebt,
} from "../generated/schema";
import { getOrCreateToken, calculateUSDValue } from "./helpers";

export function handleAaveSupply(event: AaveSupplyEvent): void {
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
    let token = getOrCreateToken(event.params.reserve);
    let decimals = token.decimals;
    let divisor = BigDecimal.fromString("1");
    for (let i = 0; i < decimals; i++) {
      divisor = divisor.times(BigDecimal.fromString("10"));
    }
    let amountDecimal = event.params.amount.toBigDecimal().div(divisor);
    collateral.amount = collateral.amount.plus(amountDecimal);
    collateral.lastUpdatedAt = event.block.timestamp;
    collateral.save();

    let protocolCollateralId =
      "protocol-collateral-" + event.params.reserve.toHexString();
    let protocolCollateral = ProtocolCollateral.load(protocolCollateralId);
    if (protocolCollateral == null) {
      protocolCollateral = new ProtocolCollateral(protocolCollateralId);
      protocolCollateral.protocol = "protocol";
      protocolCollateral.token = event.params.reserve.toHexString();
      protocolCollateral.amount = amountDecimal;
      protocolCollateral.lastUpdatedAt = event.block.timestamp;
      protocolCollateral.save();
    } else {
      protocolCollateral.amount = protocolCollateral.amount.plus(amountDecimal);
      protocolCollateral.lastUpdatedAt = event.block.timestamp;
      protocolCollateral.save();
    }
  }
}

export function handleAaveBorrow(event: AaveBorrowEvent): void {
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
      debt.interestRateMode = BigInt.fromI32(event.params.interestRateMode);
    }

    // Update amount (add borrow)
    let token = getOrCreateToken(event.params.reserve);
    let decimals = token.decimals;
    let divisor = BigDecimal.fromString("1");
    for (let i = 0; i < decimals; i++) {
      divisor = divisor.times(BigDecimal.fromString("10"));
    }
    let amountDecimal = event.params.amount.toBigDecimal().div(divisor);
    debt.amount = debt.amount.plus(amountDecimal);
    debt.lastUpdatedAt = event.block.timestamp;
    debt.save();

    let protocolDebtId = "protocol-debt-" + event.params.reserve.toHexString();
    let protocolDebt = ProtocolDebt.load(protocolDebtId);
    if (protocolDebt == null) {
      protocolDebt = new ProtocolDebt(protocolDebtId);
      protocolDebt.protocol = "protocol";
      protocolDebt.token = event.params.reserve.toHexString();
      protocolDebt.amount = amountDecimal;
      protocolDebt.lastUpdatedAt = event.block.timestamp;
      protocolDebt.save();
    } else {
      protocolDebt.amount = protocolDebt.amount.plus(amountDecimal);
      protocolDebt.lastUpdatedAt = event.block.timestamp;
      protocolDebt.save();
    }
  }

  // updateProtocolMetrics(event.block.timestamp);
}

export function handleAaveRepay(event: AaveRepayEvent): void {
  // Check if this is one of our debt positions
  let position = DebtPosition.load(event.params.user.toHexString());
  if (position != null) {
    // Find and update debt for this position
    // Note: We need to check both stable and variable rate modes
    let token = getOrCreateToken(event.params.reserve);
    let decimals = token.decimals;
    let divisor = BigDecimal.fromString("1");
    for (let i = 0; i < decimals; i++) {
      divisor = divisor.times(BigDecimal.fromString("10"));
    }
    let amountDecimal = event.params.amount.toBigDecimal().div(divisor);
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

    let protocolDebtId = "protocol-debt-" + event.params.reserve.toHexString();
    let protocolDebt = ProtocolDebt.load(protocolDebtId);
    if (protocolDebt != null) {
      protocolDebt.amount = protocolDebt.amount.minus(amountDecimal);
      protocolDebt.lastUpdatedAt = event.block.timestamp;
      protocolDebt.save();
    }
  }
}

export function handleAaveWithdraw(event: AaveWithdrawEvent): void {
  // Check if this is one of our debt positions
  let position = DebtPosition.load(event.params.user.toHexString());
  if (position != null) {
    // Update collateral for this position (subtract withdrawal)
    let collateralId = position.id + "-" + event.params.reserve.toHexString();
    let collateral = PositionCollateral.load(collateralId);
    let amountDecimal = BigDecimal.fromString("0");
    if (collateral != null) {
      let token = getOrCreateToken(event.params.reserve);
      let decimals = token.decimals;
      let divisor = BigDecimal.fromString("1");
      for (let i = 0; i < decimals; i++) {
        divisor = divisor.times(BigDecimal.fromString("10"));
      }
      amountDecimal = event.params.amount.toBigDecimal().div(divisor);

      collateral.amount = collateral.amount.minus(amountDecimal);
      if (collateral.amount.lt(BigDecimal.fromString("0"))) {
        collateral.amount = BigDecimal.fromString("0");
      }
      collateral.lastUpdatedAt = event.block.timestamp;

      collateral.save();
    }

    let protocolCollateralId =
      "protocol-collateral-" + event.params.reserve.toHexString();
    let protocolCollateral = ProtocolCollateral.load(protocolCollateralId);
    if (protocolCollateral != null) {
      protocolCollateral.amount = protocolCollateral.amount.minus(
        amountDecimal
      );
      protocolCollateral.lastUpdatedAt = event.block.timestamp;
      protocolCollateral.save();
    }
  }
}
