# Health Factor Calculation Guide

## 🎯 **Tổng quan về Health Factor**

Health Factor (HF) là chỉ số quan trọng nhất để đánh giá rủi ro thanh lý của một vị thế debt. Chúng ta cần tính toán HF real-time để hiển thị cho user và trigger các order tự động.

## 📊 **Công thức tính Health Factor**

```
Health Factor = (Total Collateral in USD × Weighted Average Liquidation Threshold) / Total Debt in USD
```

### **Thành phần:**

1. **Total Collateral USD**: Tổng giá trị tài sản thế chấp (theo giá hiện tại)
2. **Liquidation Threshold**: Ngưỡng thanh lý của từng asset (từ Aave)
3. **Total Debt USD**: Tổng giá trị nợ (theo giá hiện tại)

### **Ví dụ tính toán:**

```
Collateral:
- 10 WETH × $2,000 = $20,000 (LT = 82.5%)
- 5,000 USDC × $1 = $5,000 (LT = 87%)

Weighted LT = (20,000 × 0.825 + 5,000 × 0.87) / 25,000 = 0.8394

Debt:
- 8,000 USDC × $1 = $8,000

Health Factor = (25,000 × 0.8394) / 8,000 = 2.62
```

## 🔄 **Real-time Data Sources**

### **1. Aave Pool Events (Implemented)**

```typescript
// Lắng nghe events từ Aave Pool
export function handleAaveSupply(event: AaveSupplyEvent): void {
  // Update TokenPrice với activity mới
  updateTokenPriceFromActivity(event.params.reserve, event.block.timestamp);

  // Trigger HF recalculation cho tất cả positions có asset này
  recalculateHealthFactorsForAsset(event.params.reserve);
}
```

### **2. Aave Oracle Events (Planned)**

```typescript
// Lắng nghe price updates từ Oracle
export function handleAssetSourceUpdated(event: AssetSourceUpdatedEvent): void {
  let asset = event.params.asset;
  let newPrice = fetchPriceFromOracle(asset);

  // Update TokenPrice entity
  let tokenPrice = getOrCreateTokenPrice(asset);
  tokenPrice.priceUSD = newPrice;
  tokenPrice.lastUpdatedAt = event.block.timestamp;
  tokenPrice.save();

  // Recalculate HF cho tất cả positions
  recalculateHealthFactorsForAsset(asset);
}
```

### **3. Direct Oracle Calls (Advanced)**

```typescript
// Call trực tiếp Aave Oracle để lấy giá
function fetchLatestPrice(asset: Address): BigDecimal {
  let oracle = AaveOracle.bind(ORACLE_ADDRESS);
  let priceCall = oracle.try_getAssetPrice(asset);

  if (!priceCall.reverted) {
    // Convert từ oracle price (8 decimals) sang USD
    return priceCall.value
      .toBigDecimal()
      .div(BigDecimal.fromString("100000000"));
  }

  return BigDecimal.fromString("0");
}
```

## 🏗️ **Implementation trong Subgraph**

### **1. Health Factor Calculation Function**

```typescript
function calculateHealthFactor(position: DebtPosition): BigDecimal {
  if (position.totalDebtUSD.equals(ZERO_BD)) {
    return BigDecimal.fromString("999999"); // Very high HF when no debt
  }

  // Calculate weighted collateral value
  let weightedCollateral = position.totalCollateralUSD.times(
    position.liquidationThreshold
  );

  // HF = Weighted Collateral / Total Debt
  return weightedCollateral.div(position.totalDebtUSD);
}
```

### **2. Risk Level Classification**

```typescript
function getRiskLevel(healthFactor: BigDecimal): string {
  if (healthFactor.lt(BigDecimal.fromString("1.1"))) {
    return "CRITICAL"; // HF < 1.1 - Nguy cơ thanh lý cao
  } else if (healthFactor.lt(BigDecimal.fromString("1.3"))) {
    return "HIGH"; // 1.1 <= HF < 1.3 - Rủi ro cao
  } else if (healthFactor.lt(BigDecimal.fromString("2.0"))) {
    return "MEDIUM"; // 1.3 <= HF < 2.0 - Rủi ro trung bình
  } else {
    return "LOW"; // HF >= 2.0 - Rủi ro thấp
  }
}
```

### **3. Time to Liquidation Estimation**

```typescript
function estimateTimeToLiquidation(
  healthFactor: BigDecimal,
  currentDebtUSD: BigDecimal
): BigInt | null {
  if (healthFactor.gt(BigDecimal.fromString("1.05"))) {
    // Estimate based on interest rate (5% APY ≈ 0.000000158 per second)
    let interestRatePerSecond = BigDecimal.fromString("0.000000158");
    let debtGrowthNeeded = currentDebtUSD.times(healthFactor.minus(ONE_BD));
    let timeInSeconds = debtGrowthNeeded.div(
      currentDebtUSD.times(interestRatePerSecond)
    );

    if (timeInSeconds.lt(BigDecimal.fromString("31536000"))) {
      // < 1 year
      return BigInt.fromString(timeInSeconds.toString().split(".")[0]);
    }
  }
  return null;
}
```

## 📱 **UI Integration Examples**

### **1. GraphQL Query cho Position Dashboard**

```graphql
query GetUserPositions($user: String!) {
  user(id: $user) {
    positions {
      id
      healthFactor
      riskLevel
      timeToLiquidation
      totalCollateralUSD
      totalDebtUSD
      netEquityUSD
      liquidationThreshold

      # Real-time order executability
      activeOrders {
        triggerHF
        canExecute
        estimatedProfit
      }

      # Historical tracking
      snapshots(orderBy: timestamp, orderDirection: desc, first: 10) {
        healthFactor
        timestamp
      }
    }
  }
}
```

### **2. Real-time Subscription cho HF Updates**

```graphql
subscription HealthFactorUpdates($positionId: String!) {
  positionSnapshot(
    where: { position: $positionId }
    orderBy: timestamp
    orderDirection: desc
    first: 1
  ) {
    healthFactor
    riskLevel
    timestamp
    position {
      timeToLiquidation
    }
  }
}
```

### **3. UI Component Example**

```typescript
// React component hiển thị Health Factor
function HealthFactorDisplay({ position }) {
  const { healthFactor, riskLevel, timeToLiquidation } = position;

  const getColorByRisk = (risk) => {
    switch (risk) {
      case "CRITICAL":
        return "#ff4444";
      case "HIGH":
        return "#ff8800";
      case "MEDIUM":
        return "#ffaa00";
      case "LOW":
        return "#44ff44";
      default:
        return "#888888";
    }
  };

  return (
    <div className="health-factor-card">
      <div className="hf-value" style={{ color: getColorByRisk(riskLevel) }}>
        {healthFactor.toFixed(2)}
      </div>
      <div className="risk-level">{riskLevel} RISK</div>
      {timeToLiquidation && (
        <div className="time-warning">
          ⚠️ Est. liquidation in {formatTime(timeToLiquidation)}
        </div>
      )}
    </div>
  );
}
```

## 🚨 **Critical Implementation Notes**

### **1. Price Data Accuracy**

- **Primary Source**: Aave Oracle events cho real-time updates
- **Fallback**: Direct oracle calls khi cần thiết
- **Validation**: So sánh với external price feeds

### **2. Performance Optimization**

- **Batch Updates**: Group multiple HF calculations
- **Selective Updates**: Chỉ update positions bị ảnh hưởng
- **Caching**: Cache intermediate calculations

### **3. Error Handling**

```typescript
function safeCalculateHealthFactor(position: DebtPosition): BigDecimal {
  try {
    return calculateHealthFactor(position);
  } catch (error) {
    log.error("HF calculation failed for position: {}", [position.id]);
    return position.healthFactor; // Return previous value
  }
}
```

## 📈 **Advanced Features**

### **1. Predictive Health Factor**

```typescript
// Dự đoán HF sau X giây với interest rate hiện tại
function predictHealthFactor(
  position: DebtPosition,
  secondsAhead: BigInt
): BigDecimal {
  let currentDebt = position.totalDebtUSD;
  let interestRate = getAverageInterestRate(position);
  let futureDebt = currentDebt.times(
    ONE_BD.plus(interestRate.times(secondsAhead.toBigDecimal()))
  );

  return position.totalCollateralUSD
    .times(position.liquidationThreshold)
    .div(futureDebt);
}
```

### **2. Multi-Asset Health Factor Breakdown**

```typescript
// Tính contribution của từng asset vào HF
function calculateAssetContributions(
  position: DebtPosition
): Map<string, BigDecimal> {
  let contributions = new Map<string, BigDecimal>();

  // Calculate cho từng collateral asset
  for (let collateral of position.collaterals) {
    let contribution = collateral.valueUSD
      .times(collateral.liquidationThreshold)
      .div(position.totalDebtUSD);
    contributions.set(collateral.token, contribution);
  }

  return contributions;
}
```

## 🎯 **Next Steps**

1. **Get Aave ABIs**: Download Pool.json và Oracle.json
2. **Complete Oracle Integration**: Implement real price fetching
3. **Test HF Calculations**: Verify accuracy với Aave data
4. **UI Integration**: Connect GraphQL queries với frontend
5. **Real-time Alerts**: Implement HF threshold notifications

Với implementation này, users sẽ có:

- ✅ Real-time Health Factor updates
- ✅ Risk level classification
- ✅ Time to liquidation estimates
- ✅ Historical HF tracking
- ✅ Order executability status
- ✅ Predictive analytics
