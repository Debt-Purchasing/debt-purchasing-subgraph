import { BigInt, BigDecimal, log } from "@graphprotocol/graph-ts";
import { AnswerUpdated } from "../generated/WETHOracle/ChainlinkAggregator";

import {
  getOrCreateToken,
  createPriceSnapshot,
  getTokenSymbol,
  getAssetForOracle,
} from "./helpers";

export function handlePriceUpdated(event: AnswerUpdated): void {
  let oracleAddress = event.address;

  log.info("Chainlink price update: oracle {} price {}", [
    oracleAddress.toHexString(),
    event.params.current.toString(),
  ]);

  // Use direct oracle-to-asset lookup instead of looping through all assets
  let assetAddress = getAssetForOracle(oracleAddress);

  // Early return if no mapping found
  if (!assetAddress) {
    log.warning("No dynamic asset mapping found for oracle {}", [
      oracleAddress.toHexString(),
    ]);
    return;
  }

  // Validate price data
  let priceRaw = event.params.current;
  if (priceRaw.le(BigInt.fromI32(0))) {
    log.warning("Invalid price received: {}", [priceRaw.toString()]);
    return;
  }

  // Convert price from oracle format (8 decimals) to USD
  let priceUSD = priceRaw
    .toBigDecimal()
    .div(BigDecimal.fromString("100000000"));

  // Update token price
  let token = getOrCreateToken(assetAddress);
  let oldPrice = token.priceUSD;
  token.priceUSD = priceUSD;
  token.lastUpdatedAt = event.block.timestamp;
  token.oracleSource = oracleAddress.toHexString();
  token.save();

  // Create price snapshot
  createPriceSnapshot(
    assetAddress,
    priceUSD,
    event.block.timestamp,
    event.block.number
  );
}
