import { Address, BigInt, BigDecimal, log } from "@graphprotocol/graph-ts";
import {
  AssetSourceUpdated as AssetSourceUpdatedEvent,
  FallbackOracleUpdated as FallbackOracleUpdatedEvent,
} from "../generated/AaveOracle/AaveOracle";
import {
  getTokenSymbol,
  getOracleTokenSymbol,
  initializeToken,
  createOrUpdateAssetOracleMapping,
  createOrUpdateOracleAssetMapping,
} from "./helpers";

export function handleAssetSourceUpdated(event: AssetSourceUpdatedEvent): void {
  let assetAddress = event.params.asset;
  let oracleAddress = event.params.source;

  log.info("Oracle mapping updated: asset {} -> oracle {}", [
    assetAddress.toHexString(),
    oracleAddress.toHexString(),
  ]);

  // Create or update bidirectional mappings
  createOrUpdateAssetOracleMapping(
    assetAddress,
    oracleAddress,
    event.block.timestamp
  );

  createOrUpdateOracleAssetMapping(
    oracleAddress,
    assetAddress,
    event.block.timestamp
  );

  // Initialize or update token with oracle source
  let assetSymbol = getTokenSymbol(assetAddress);
  let oracleSymbol = getOracleTokenSymbol(oracleAddress);

  // Verify symbols match (good practice)
  if (
    assetSymbol != oracleSymbol &&
    assetSymbol != "UNKNOWN" &&
    oracleSymbol != "UNKNOWN"
  ) {
    log.warning("Symbol mismatch: asset {} oracle {}", [
      assetSymbol,
      oracleSymbol,
    ]);
  }

  let token = initializeToken(assetAddress, assetSymbol, oracleAddress);

  token.lastUpdatedAt = event.block.timestamp;
  token.save();

  log.info("Token initialized: {} with oracle {}", [
    assetSymbol,
    oracleAddress.toHexString(),
  ]);
}
