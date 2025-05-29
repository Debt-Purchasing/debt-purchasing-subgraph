import { BigInt, BigDecimal, Address } from "@graphprotocol/graph-ts";
import {
  DebtPosition,
  PositionCollateral,
  PositionDebt,
  TokenPrice,
} from "../generated/schema";

// This file is for handling AaveDebt contract events
// Currently AaveDebt doesn't emit its own events, but this template
// is set up for future extensibility if needed

// Helper functions for position data updates would go here
// These would be called from the main AaveRouter handlers when
// position balances need to be updated from Aave contract calls
