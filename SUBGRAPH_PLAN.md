# Debt Purchasing Protocol - Subgraph Implementation Plan

## 🎯 Objective

Implement a comprehensive subgraph to move all heavy calculations server-side, providing optimal UI/UX performance with real-time data updates and pre-calculated metrics.

## 📊 Current Pain Points (Client-Side)

### Performance Issues:

- Multiple RPC calls for position data
- Heavy calculations for Health Factor monitoring
- Real-time price fetching and conversions
- Order validation across multiple contracts
- Historical data aggregation

### User Experience Problems:

- Slow loading times for position summaries
- Delayed Health Factor updates
- Complex order discovery and filtering
- No historical performance tracking
- High gas costs for data queries

## 🚀 Subgraph Benefits

### Performance Optimization:

- **Single GraphQL query** instead of multiple RPC calls
- **Pre-calculated metrics** updated in real-time
- **Indexed historical data** for instant access
- **Optimized data structures** for UI consumption
- **Reduced client-side computation**

### Enhanced UX:

- **Instant loading** of position summaries
- **Real-time notifications** for Health Factor changes
- **Advanced filtering** and sorting capabilities
- **Historical analytics** and performance tracking
- **Predictive insights** for order execution

## 📋 Entities to Track

### 1. User Entity

```graphql
type User @entity {
  id: ID! # User address
  totalPositions: BigInt! # Number of debt positions created
  totalOrdersCreated: BigInt! # Orders created as seller
  totalOrdersExecuted: BigInt! # Orders executed as buyer
  totalVolumeTraded: BigDecimal! # Total volume in USD
  positions: [DebtPosition!]! @derivedFrom(field: "owner")
  sellOrders: [Order!]! @derivedFrom(field: "seller")
  buyExecutions: [OrderExecution!]! @derivedFrom(field: "buyer")
  createdAt: BigInt!
  lastActiveAt: BigInt!
}
```

### 2. DebtPosition Entity

```graphql
type DebtPosition @entity {
  id: ID! # Debt contract address
  owner: User! # Current owner
  nonce: BigInt! # Current nonce
  # Collateral tracking
  collaterals: [PositionCollateral!]! @derivedFrom(field: "position")
  totalCollateralUSD: BigDecimal! # Pre-calculated total value
  # Debt tracking
  debts: [PositionDebt!]! @derivedFrom(field: "position")
  totalDebtUSD: BigDecimal! # Pre-calculated total value
  # Health metrics (updated real-time)
  healthFactor: BigDecimal! # Current HF
  liquidationThreshold: BigDecimal! # Weighted average LT
  maxLTV: BigDecimal! # Maximum LTV
  # Risk assessment
  riskLevel: RiskLevel! # LOW, MEDIUM, HIGH, CRITICAL
  timeToLiquidation: BigInt # Estimated time in seconds
  # Performance tracking
  netEquityUSD: BigDecimal! # Collateral - Debt
  totalPnL: BigDecimal! # Lifetime P&L
  # Order tracking
  activeOrders: [Order!]! @derivedFrom(field: "position")
  orderHistory: [OrderExecution!]! @derivedFrom(field: "position")

  # Timestamps
  createdAt: BigInt!
  lastUpdatedAt: BigInt!

  # Historical snapshots
  snapshots: [PositionSnapshot!]! @derivedFrom(field: "position")
}
```

### 3. Order Entities

```graphql
type Order @entity {
  id: ID! # Order hash
  type: OrderType! # FULL_SALE, PARTIAL_SALE
  position: DebtPosition! # Associated position
  seller: User! # Order creator
  # Order details
  triggerHF: BigDecimal! # Health Factor trigger
  startTime: BigInt! # Order start time
  endTime: BigInt! # Order expiry
  # Full sale specific
  paymentToken: Bytes # Token for premium payment
  percentOfEquity: BigInt # Percentage of equity to seller
  # Partial sale specific
  repayToken: Bytes # Token for debt repayment
  repayAmount: BigDecimal # Amount to repay
  collateralTokens: [Bytes!] # Collateral tokens to withdraw
  collateralPercents: [BigInt!] # Allocation percentages
  bonus: BigInt # Buyer bonus percentage
  # Calculated values (updated real-time)
  estimatedPremium: BigDecimal # Expected premium in USD
  estimatedProfit: BigDecimal # Expected buyer profit
  profitMargin: BigDecimal # Profit as percentage
  # Status tracking
  status: OrderStatus! # ACTIVE, EXPIRED, EXECUTED, CANCELLED
  canExecute: Boolean! # Real-time executability
  # Execution tracking
  execution: OrderExecution # Execution details if executed
  # Timestamps
  createdAt: BigInt!
  lastUpdatedAt: BigInt!
}

type OrderExecution @entity {
  id: ID! # Transaction hash
  order: Order! # Original order
  position: DebtPosition! # Position involved
  buyer: User! # Order executor
  # Execution details
  executionPrice: BigDecimal! # Actual execution price
  actualProfit: BigDecimal! # Actual buyer profit
  premiumPaid: BigDecimal! # Premium paid to seller
  gasUsed: BigInt! # Gas consumed
  gasPriceGwei: BigDecimal! # Gas price in Gwei
  # Post-execution actions
  debtsRepaid: [DebtRepayment!]! @derivedFrom(field: "execution")
  collateralsWithdrawn: [CollateralWithdrawal!]!
    @derivedFrom(field: "execution")

  # Performance metrics
  executionTime: BigInt! # Block timestamp
  blockNumber: BigInt! # Block number
  # Strategy used
  strategy: ExecutionStrategy! # FULL_CLEANUP, STRATEGIC, MINIMAL
}
```

### 4. Market Data Entities

```graphql
type TokenPrice @entity {
  id: ID! # Token address
  symbol: String! # Token symbol
  decimals: Int! # Token decimals
  priceUSD: BigDecimal! # Current price in USD
  lastUpdatedAt: BigInt! # Last price update
  # Historical tracking
  priceHistory: [PriceSnapshot!]! @derivedFrom(field: "token")
}

type PriceSnapshot @entity {
  id: ID! # token-timestamp
  token: TokenPrice! # Token reference
  priceUSD: BigDecimal! # Price at snapshot
  timestamp: BigInt! # Snapshot time
  blockNumber: BigInt! # Block number
}
```

## 🔄 Real-Time Calculations

### Health Factor Monitoring

```typescript
// Update HF when any position-affecting event occurs
function updateHealthFactor(positionId: string): void {
  let position = DebtPosition.load(positionId)!;

  // Calculate weighted liquidation threshold
  let totalCollateralUSD = BigDecimal.fromString("0");
  let weightedLT = BigDecimal.fromString("0");

  for (let i = 0; i < position.collaterals.length; i++) {
    let collateral = PositionCollateral.load(position.collaterals[i])!;
    let valueUSD = collateral.amount.times(collateral.token.priceUSD);
    totalCollateralUSD = totalCollateralUSD.plus(valueUSD);
    weightedLT = weightedLT.plus(
      valueUSD.times(collateral.liquidationThreshold)
    );
  }

  if (totalCollateralUSD.gt(BigDecimal.fromString("0"))) {
    weightedLT = weightedLT.div(totalCollateralUSD);
  }

  // Calculate health factor
  let totalDebtUSD = calculateTotalDebt(position);
  let healthFactor = totalCollateralUSD.times(weightedLT).div(totalDebtUSD);

  position.healthFactor = healthFactor;
  position.totalCollateralUSD = totalCollateralUSD;
  position.totalDebtUSD = totalDebtUSD;
  position.netEquityUSD = totalCollateralUSD.minus(totalDebtUSD);
  position.liquidationThreshold = weightedLT;

  // Update risk level
  position.riskLevel = calculateRiskLevel(healthFactor);
  position.timeToLiquidation = estimateTimeToLiquidation(position);

  position.save();
}
```

### Order Executability

```typescript
function updateOrderExecutability(orderId: string): void {
  let order = Order.load(orderId)!;
  let position = DebtPosition.load(order.position)!;

  let currentTime = BigInt.fromI32(Date.now() / 1000);
  let isTimeValid =
    currentTime.ge(order.startTime) && currentTime.le(order.endTime);
  let isHFTriggered = position.healthFactor.le(order.triggerHF);
  let isNonceValid = position.nonce.equals(order.nonce);

  order.canExecute = isTimeValid && isHFTriggered && isNonceValid;

  if (order.canExecute) {
    // Update estimated values
    if (order.type == "FULL_SALE") {
      order.estimatedPremium = position.netEquityUSD
        .times(BigDecimal.fromString(order.percentOfEquity.toString()))
        .div(BigDecimal.fromString("10000"));
      order.estimatedProfit = position.netEquityUSD.minus(
        order.estimatedPremium
      );
    } else {
      // Partial sale calculations
      order.estimatedProfit = order.repayAmount.times(
        BigDecimal.fromString("1").plus(
          order.bonus.toBigDecimal().div(BigDecimal.fromString("10000"))
        )
      );
    }
  }

  order.save();
}
```

## 📈 GraphQL Queries for UI

### 1. Position Dashboard

```graphql
query GetUserPositions($user: String!) {
  user(id: $user) {
    positions {
      id
      healthFactor
      riskLevel
      totalCollateralUSD
      totalDebtUSD
      netEquityUSD
      timeToLiquidation
      collaterals {
        token {
          symbol
        }
        amount
        valueUSD
      }
      debts {
        token {
          symbol
        }
        amount
        valueUSD
        interestRate
      }
      activeOrders {
        id
        type
        canExecute
        estimatedPremium
        triggerHF
        endTime
      }
    }
  }
}
```

### 2. Order Discovery

```graphql
query GetExecutableOrders(
  $minProfit: BigDecimal!
  $maxRisk: RiskLevel!
  $orderType: OrderType
) {
  orders(
    where: {
      canExecute: true
      estimatedProfit_gte: $minProfit
      position_: { riskLevel_lte: $maxRisk }
      type: $orderType
    }
    orderBy: estimatedProfit
    orderDirection: desc
  ) {
    id
    type
    estimatedProfit
    estimatedPremium
    profitMargin
    triggerHF
    endTime
    position {
      healthFactor
      riskLevel
      totalCollateralUSD
      totalDebtUSD
    }
    seller {
      id
    }
  }
}
```

### 3. Historical Analytics

```graphql
query GetPositionHistory($positionId: String!) {
  debtPosition(id: $positionId) {
    snapshots(orderBy: timestamp, orderDirection: desc, first: 100) {
      timestamp
      healthFactor
      totalCollateralUSD
      totalDebtUSD
      netEquityUSD
    }
    orderHistory {
      executionTime
      actualProfit
      premiumPaid
      strategy
      buyer {
        id
      }
    }
  }
}
```

## 🛠️ Implementation Steps

### Phase 1: Core Setup

1. **Initialize subgraph project** with Graph CLI
2. **Define schema** with all entities
3. **Set up event handlers** for core contract events
4. **Deploy to hosted service** or decentralized network

### Phase 2: Data Indexing

1. **Index historical data** from contract deployment
2. **Set up real-time event processing**
3. **Implement calculation functions**
4. **Add price feed integration**

### Phase 3: Advanced Features

1. **Add predictive analytics**
2. **Implement notification triggers**
3. **Create performance metrics**
4. **Add market insights**

### Phase 4: UI Integration

1. **Update frontend to use GraphQL**
2. **Remove direct RPC calls**
3. **Implement real-time subscriptions**
4. **Add advanced filtering and sorting**

## 📊 Performance Metrics

### Before Subgraph:

- **Position load time**: 3-5 seconds (multiple RPC calls)
- **Order discovery**: 10+ seconds (scanning multiple contracts)
- **Health Factor updates**: Manual refresh required
- **Historical data**: Not available

### After Subgraph:

- **Position load time**: <500ms (single GraphQL query)
- **Order discovery**: <1 second (pre-filtered and sorted)
- **Health Factor updates**: Real-time via subscriptions
- **Historical data**: Instant access to full history

## 🔄 Next Steps for Tomorrow

1. **Set up Graph CLI and project structure**
2. **Define complete schema with all entities**
3. **Implement core event handlers**
4. **Deploy initial version for testing**
5. **Begin UI integration planning**

This subgraph implementation will transform the user experience from slow, client-heavy operations to instant, server-optimized queries! 🚀
