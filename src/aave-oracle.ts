import { AssetSourceUpdated as AssetSourceUpdatedEvent } from "../generated/AaveOracle/AaveOracle";
import {
  getTokenSymbol,
  getOracleTokenSymbol,
  initializeToken,
  createOrUpdateAssetOracleMapping,
  createOrUpdateOracleAssetMapping,
} from "./helpers";
import { ChainlinkOracleTemplate } from "../generated/templates";

export function handleAssetSourceUpdated(event: AssetSourceUpdatedEvent): void {
  let assetAddress = event.params.asset;
  let oracleAddress = event.params.source;

  ChainlinkOracleTemplate.create(oracleAddress);

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
  }

  let token = initializeToken(assetAddress, assetSymbol, oracleAddress);

  token.lastUpdatedAt = event.block.timestamp;
  token.save();
}
