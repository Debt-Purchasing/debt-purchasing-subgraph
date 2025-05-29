# Aave Subgraph Integration Guide

## Overview

Aave có một hệ thống subgraph public rất mạnh mẽ với nhiều entities đã được sync và tính toán sẵn. Chúng ta có thể tận dụng những entities này để cải thiện hiệu suất và độ chính xác của subgraph riêng.

## Aave Public Subgraph Endpoints

### Production Networks

- **ETH Mainnet V3**: `https://api.thegraph.com/subgraphs/name/aave/protocol-v3`
- **Polygon V3**: `https://api.thegraph.com/subgraphs/name/aave/protocol-v3-polygon`
- **Arbitrum V3**: `https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum`
- **Optimism V3**: `https://api.thegraph.com/subgraphs/name/aave/protocol-v3-optimism`
- **Base V3**: `https://api.thegraph.com/subgraphs/name/aave/protocol-v3-base`

### Test Networks

- **Goerli V3**: `https://api.thegraph.com/subgraphs/name/aave/protocol-v3-goerli`
- **Mumbai V3**: `https://api.thegraph.com/subgraphs/name/aave/protocol-v3-mumbai`
- **Fuji V3**: `https://api.thegraph.com/subgraphs/name/aave/protocol-v3-fuji`

### ⚠️ Sepolia Status

Hiện tại **Aave V3 Sepolia subgraph chưa được deploy** (có open issue #103 trong repo của họ). Điều này có nghĩa là:

- Chúng ta cần tự implement logic tính toán cho Sepolia
- Có thể sử dụng Goerli endpoint cho testing
- Hoặc chờ Aave deploy Sepolia subgraph

## Key Aave Entities

### 1. Reserve Entity

```graphql
type Reserve {
  id: ID!
  underlyingAsset: Bytes!
  pool: Pool!
  symbol: String!
  name: String!
  decimals: Int!

  # Rates (APR in RAY units 10^27)
  liquidityRate: BigInt!
  variableBorrowRate: BigInt!
  stableBorrowRate: BigInt!

  # Configuration
  liquidationThreshold: BigInt!
  liquidationBonus: BigInt!
  reserveFactor: BigInt!

  # Amounts
  totalLiquidity: BigInt!
  availableLiquidity: BigInt!
  totalCurrentVariableDebt: BigInt!
  totalCurrentStableDebt: BigInt!

  # Price
  priceInEth: BigInt!
  priceInUsd: BigDecimal!

  # Tokens
  aToken: AToken!
  vToken: VariableDebtToken!
  sToken: StableDebtToken!
}
```

### 2. User Entity

```graphql
type User {
  id: ID!
  borrowedReservesCount: Int!
  unclaimedRewards: BigInt!
  lifetimeRewards: BigInt!
  incentivesLastUpdated: Int!
  reserves: [UserReserve!]! @derivedFrom(field: "user")
}
```

### 3. UserReserve Entity

```graphql
type UserReserve {
  id: ID!
  pool: Pool!
  reserve: Reserve!
  user: User!

  # Balances (scaled, need formatting)
  currentATokenBalance: BigInt!
  currentVariableDebt: BigInt!
  currentStableDebt: BigInt!
  currentTotalDebt: BigInt!

  # Scaled balances
  scaledATokenBalance: BigInt!
  scaledVariableDebt: BigInt!

  # Configuration
  usageAsCollateralEnabledOnUser: Boolean!
  stableBorrowRate: BigInt!
  stableBorrowLastUpdateTimestamp: Int!
}
```

### 4. UserTransaction Interface

```graphql
interface UserTransaction {
  id: ID!
  txHash: Bytes!
  action: Action!
  pool: Pool!
  user: User!
  timestamp: Int!
  gasPrice: BigInt!
  gasUsed: BigInt!
}

# Implementations
type Supply implements UserTransaction
type Withdraw implements UserTransaction
type Borrow implements UserTransaction
type Repay implements UserTransaction
type LiquidationCall implements UserTransaction
type SwapBorrowRate implements UserTransaction
type UsageAsCollateral implements UserTransaction
```

### 5. Protocol Entity

```graphql
type Protocol {
  id: ID!
  pools: [Pool!]! @derivedFrom(field: "protocol")
}

type Pool {
  id: ID!
  protocol: Protocol!
  lendingPool: Bytes
  lendingPoolCore: Bytes
  lendingPoolParametersProvider: Bytes
  lendingPoolManager: Bytes
  lendingPoolConfigurator: Bytes
  lendingPoolLiquidationManager: Bytes
  lendingPoolDataProvider: Bytes
  proxyPriceProvider: Bytes
  lendingRateOracle: Bytes
  feeProvider: Bytes
  reserves: [Reserve!]! @derivedFrom(field: "pool")
}
```

## Integration Strategies

### 1. Cross-Protocol Position Tracking

```typescript
// In our event handlers
export function handleCreateDebt(event: CreateDebtEvent): void {
  let debtPosition = new DebtPosition(event.params.debtId.toString());

  // ... set basic fields ...

  // Query Aave for user's existing positions
  let user = getOrCreateUser(event.params.user);
  user.aaveHealthFactor = calculateAaveHealthFactor(event.params.user);
  user.totalDefiExposure = calculateTotalExposure(event.params.user);

  user.save();
  debtPosition.save();
}

function calculateAaveHealthFactor(userAddress: Address): BigDecimal {
  // This would require external API call to Aave subgraph
  // Or we can implement our own calculation using Aave's reserve data
  return BigDecimal.fromString("1.5"); // placeholder
}
```

### 2. Real-time Price Integration

```typescript
// Helper function to get asset prices from Aave
function getAssetPriceFromAave(asset: Address): BigDecimal {
  // Query Aave's reserve entity for price data
  // This provides more accurate pricing than our own oracle
  return BigDecimal.fromString("1000"); // placeholder
}

export function handleSupply(event: SupplyEvent): void {
  let transaction = new Transaction(event.transaction.hash.toHex());

  // Get real-time price from Aave
  let assetPrice = getAssetPriceFromAave(event.params.asset);
  transaction.assetPriceUSD = assetPrice;
  transaction.valueUSD = event.params.amount.toBigDecimal().times(assetPrice);

  transaction.save();
}
```

### 3. Liquidation Opportunity Detection

```typescript
// Monitor both protocols for liquidation opportunities
export function handleBorrow(event: BorrowEvent): void {
  let position = DebtPosition.load(event.params.debtId.toString());
  if (!position) return;

  // Calculate health factor using both protocols
  let combinedHealthFactor = calculateCombinedHealthFactor(
    Address.fromString(position.borrower),
    position.collateralAmount,
    position.debtAmount
  );

  position.healthFactor = combinedHealthFactor;
  position.riskLevel = getRiskLevel(combinedHealthFactor);

  // Create liquidation alert if needed
  if (combinedHealthFactor.lt(BigDecimal.fromString("1.1"))) {
    createLiquidationAlert(position);
  }

  position.save();
}
```

## Sample Queries for Integration

### 1. Get Reserve Data for Health Factor Calculations

```graphql
query GetReserveData {
  reserves {
    id
    symbol
    decimals
    liquidityRate
    variableBorrowRate
    liquidationThreshold
    reserveLiquidationThreshold
    priceInEth
    priceInUsd
    totalLiquidity
    availableLiquidity
  }
}
```

### 2. Get User Positions Across Protocols

```graphql
query GetUserPositions($userAddress: String!) {
  user(id: $userAddress) {
    id
    borrowedReservesCount
    reserves {
      currentATokenBalance
      currentVariableDebt
      currentStableDebt
      usageAsCollateralEnabledOnUser
      reserve {
        symbol
        decimals
        priceInEth
        liquidationThreshold
      }
    }
  }
}
```

### 3. Monitor Recent Liquidations

```graphql
query GetRecentLiquidations($timestamp: Int!) {
  liquidationCalls(
    where: { timestamp_gte: $timestamp }
    orderBy: timestamp
    orderDirection: desc
    first: 100
  ) {
    id
    user {
      id
    }
    collateralReserve {
      symbol
    }
    principalReserve {
      symbol
    }
    collateralAmount
    principalAmount
    liquidator
    timestamp
  }
}
```

## Implementation Plan

### Phase 1: Basic Integration

1. Add external data source configuration for Aave subgraph
2. Create helper functions to query Aave data
3. Integrate basic price feeds from Aave reserves

### Phase 2: Advanced Features

1. Cross-protocol health factor calculations
2. Liquidation opportunity detection
3. User portfolio aggregation

### Phase 3: Real-time Monitoring

1. Event-driven updates from both protocols
2. Risk assessment algorithms
3. Automated alert systems

## Benefits of Integration

1. **Accurate Pricing**: Leverage Aave's battle-tested price oracles
2. **Risk Assessment**: Better health factor calculations using real market data
3. **Liquidation Opportunities**: Monitor positions across both protocols
4. **User Experience**: Provide comprehensive DeFi portfolio view
5. **Performance**: Reduce redundant calculations by using Aave's pre-computed data

## Considerations

1. **Network Dependency**: Our subgraph becomes dependent on Aave's subgraph availability
2. **Data Consistency**: Need to handle potential delays or inconsistencies between subgraphs
3. **Sepolia Limitation**: Currently no Aave V3 subgraph on Sepolia
4. **Rate Limits**: The Graph has query rate limits for external subgraph calls

## Next Steps

1. Test integration with Goerli Aave subgraph
2. Implement basic price feed integration
3. Create comprehensive testing suite
4. Monitor Aave's Sepolia deployment progress
5. Document integration patterns for team
