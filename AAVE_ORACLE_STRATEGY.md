# Aave Oracle Strategy for Sepolia Testnet

## 🎯 **Tổng quan về Aave Oracle Architecture**

Aave Oracle hoạt động như một **aggregator oracle** - nó không trực tiếp cung cấp giá mà query từ các oracle nhỏ hơn cho từng asset:

### **Mainnet Architecture**:

- **Aave Oracle** (`0x54586bE62E3c3580375aE3723C145253060Ca0C2`) → **Chainlink Price Feeds**
- Mỗi asset có riêng Chainlink oracle (BTC/USD, ETH/USD, etc.)
- Real-time price updates từ Chainlink network
- Events: `AssetSourceUpdated` khi oracle source thay đổi

### **Sepolia Testnet Architecture**:

- **Aave Oracle** (`0x2da88497588bf89281816106C7259e31AF45a663`) → **Mock Oracles**
- Mỗi asset có riêng mock oracle với giá cố định
- **WBTC**: Mock oracle `0x784B90bA1E9a8cf3C9939c2e072F058B024C4b8a` → Fixed \$60,000
- **WETH**: Mock oracle → Fixed ~\$2,000
- **USDC**: Mock oracle → Fixed \$1.00
- Không có real-time updates, chỉ static prices

## 📊 **Oracle Mapping Examples**

### **Complete Sepolia Testnet Asset Mapping**:

| Asset    | Token Address                                | Mock Oracle                                  | Fixed Price |
| -------- | -------------------------------------------- | -------------------------------------------- | ----------- |
| **WBTC** | `0x29f2D40B0605204364af54EC677bD022dA425d03` | `0x784B90bA1E9a8cf3C9939c2e072F058B024C4b8a` | \$60,000    |
| **DAI**  | `0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357` | `0x9aF11c35c5d3Ae182C0050438972aac4376f9516` | \$1.00      |
| **LINK** | `0xf8Fb3713D459D7C1018BD0A49D19b4C44290EBE5` | `0x14fC51b7df22b4D393cD45504B9f0A3002A63F3F` | ~\$15.00    |
| **USDC** | `0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8` | `0x98458D6A99489F15e6eB5aFa67ACFAcf6F211051` | \$1.00      |

### **WBTC Oracle Chain Example**:

```
Aave Oracle (0x2da88497588bf89281816106C7259e31AF45a663)
    ↓ getSourceOfAsset(0x29f2D40B0605204364af54EC677bD022dA425d03)
WBTC Mock Oracle (0x784B90bA1E9a8cf3C9939c2e072F058B024C4b8a)
    ↓ latestAnswer()
Fixed Price: $60,000 USD (never changes)
```

### **Key Characteristics**:

- ✅ **Static Prices**: Each oracle returns ONE fixed price throughout its lifetime
- ✅ **No Updates**: Prices never change, perfect for predictable testing
- ✅ **Reliable**: No network issues or price volatility concerns
- ❌ **No Events**: Mock oracles don't emit price update events
- ❌ **No AssetSourceUpdated**: Aave Oracle rarely changes sources on testnet

### **Critical Insight for Subgraph Strategy**:

**Since mock oracles NEVER update prices**, our subgraph strategy should be:

1. **One-time Initialization**: Initialize all known asset prices once at subgraph start
2. **No Oracle Event Tracking**: Skip Oracle events since they don't provide value
3. **Focus on Pool Events**: Track Aave Pool activity for position changes
4. **Static Price Calculations**: Use fixed prices for all Health Factor calculations

### **Simplified Implementation Approach**:

```typescript
// Initialize once and forget - prices never change
function initializeStaticTestnetPrices(): void {
  let wbtc = getOrCreateTokenPrice(
    Address.fromString("0x29f2D40B0605204364af54EC677bD022dA425d03")
  );
  wbtc.symbol = "WBTC";
  wbtc.priceUSD = BigDecimal.fromString("60000"); // Never changes
  wbtc.oracleSource = "0x784B90bA1E9a8cf3C9939c2e072F058B024C4b8a";
  wbtc.save();

  let dai = getOrCreateTokenPrice(
    Address.fromString("0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357")
  );
  dai.symbol = "DAI";
  dai.priceUSD = BigDecimal.fromString("1"); // Never changes
  dai.oracleSource = "0x9aF11c35c5d3Ae182C0050438972aac4376f9516";
  dai.save();

  let link = getOrCreateTokenPrice(
    Address.fromString("0xf8Fb3713D459D7C1018BD0A49D19b4C44290EBE5")
  );
  link.symbol = "LINK";
  link.priceUSD = BigDecimal.fromString("15"); // Never changes
  link.oracleSource = "0x14fC51b7df22b4D393cD45504B9f0A3002A63F3F";
  link.save();

  let usdc = getOrCreateTokenPrice(
    Address.fromString("0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8")
  );
  usdc.symbol = "USDC";
  usdc.priceUSD = BigDecimal.fromString("1"); // Never changes
  usdc.oracleSource = "0x98458D6A99489F15e6eB5aFa67ACFAcf6F211051";
  usdc.save();
}

// No need for complex oracle calls - just return static prices
function getAssetPrice(asset: Address): BigDecimal {
  let tokenPrice = TokenPrice.load(asset.toHexString());
  if (tokenPrice != null) {
    return tokenPrice.priceUSD; // Always the same
  }
  return ZERO_BD;
}
```

## 🔄 **Revised Strategy cho Subgraph**

### **1. Oracle Event Strategy**

Thay vì track individual asset oracles, chúng ta track Aave Oracle events:

```typescript
// Track Aave Oracle events for asset source changes
export function handleAssetSourceUpdated(event: AssetSourceUpdatedEvent): void {
  let asset = event.params.asset;
  let newSource = event.params.source;

  log.info("Asset {} oracle source updated to {}", [
    asset.toHexString(),
    newSource.toHexString(),
  ]);

  // On testnet: newSource sẽ là mock oracle address
  // On mainnet: newSource sẽ là Chainlink feed address

  // Update TokenPrice entity với source info
  let tokenPrice = getOrCreateTokenPrice(asset);
  tokenPrice.oracleSource = newSource.toHexString();
  tokenPrice.lastUpdatedAt = event.block.timestamp;

  // Fetch price từ new source (static trên testnet)
  let newPrice = fetchPriceFromAaveOracle(asset);
  if (!newPrice.equals(ZERO_BD)) {
    tokenPrice.priceUSD = newPrice;
    createPriceSnapshot(
      asset,
      newPrice,
      event.block.timestamp,
      event.block.number
    );
  }

  tokenPrice.save();
}
```

### **2. Price Fetching Strategy**

```typescript
// Fetch price through Aave Oracle (works for both mainnet and testnet)
function fetchPriceFromAaveOracle(asset: Address): BigDecimal {
  // Call Aave Oracle contract
  let oracle = AaveOracle.bind(AAVE_ORACLE_ADDRESS);
  let priceCall = oracle.try_getAssetPrice(asset);

  if (!priceCall.reverted) {
    // Aave Oracle returns price in 8 decimals (like Chainlink)
    return priceCall.value
      .toBigDecimal()
      .div(BigDecimal.fromString("100000000")); // Convert from 8 decimals
  }

  // Fallback to static testnet prices if oracle call fails
  return fetchTestnetPriceFallback(asset);
}

// Fallback for testnet when oracle calls fail
function fetchTestnetPriceFallback(asset: Address): BigDecimal {
  let assetStr = asset.toHexString().toLowerCase();

  if (assetStr == "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599") {
    return BigDecimal.fromString("60000"); // WBTC
  } else if (assetStr == "0xc558dbdd856501fcd9aaf1e62eae57a9f0629a3c") {
    return BigDecimal.fromString("2000"); // WETH
  } else if (assetStr == "0x94a9d9ac8a22534e3faca9f4e7f2e2cf85d5e4c8") {
    return BigDecimal.fromString("1"); // USDC
  } else if (assetStr == "0xff34b3d4aee8ddcd6f9afffb6fe49bd371b8a357") {
    return BigDecimal.fromString("1"); // DAI
  }

  return ZERO_BD;
}
```

### **3. Initialization Strategy**

```typescript
// Initialize prices by calling Aave Oracle directly
function initializePricesFromAaveOracle(): void {
  log.info("Initializing prices from Aave Oracle", []);

  // Known Sepolia testnet assets
  let assets = [
    "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", // WBTC
    "0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c", // WETH
    "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8", // USDC
    "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357", // DAI
  ];

  for (let i = 0; i < assets.length; i++) {
    let asset = Address.fromString(assets[i]);
    let tokenPrice = getOrCreateTokenPrice(asset);

    // Try to fetch from Aave Oracle
    let price = fetchPriceFromAaveOracle(asset);
    if (!price.equals(ZERO_BD)) {
      tokenPrice.priceUSD = price;
      tokenPrice.lastUpdatedAt = BigInt.fromI32(1640995200);

      // Set asset-specific parameters
      if (assets[i] == "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599") {
        tokenPrice.symbol = "WBTC";
        tokenPrice.decimals = 8;
        tokenPrice.liquidationThreshold = BigDecimal.fromString("0.8");
        tokenPrice.ltv = BigDecimal.fromString("0.75");
      }
      // ... other assets

      tokenPrice.save();
    }
  }
}
```

## 🏗️ **Implementation Plan**

### **Phase 1: Remove Oracle Event Dependency**

1. **Update subgraph.yaml**: Remove Oracle events hoặc mark as optional
2. **Static Price Initialization**: Initialize known testnet prices
3. **Simplified Calculations**: Use static prices for HF calculations

### **Phase 2: Focus on Aave Pool Events**

1. **Pool Events Priority**: Focus on Supply/Borrow/Repay/Withdraw events
2. **Balance Tracking**: Track actual balance changes from Pool
3. **Activity-based Updates**: Update positions based on activity, not price changes

### **Phase 3: Testnet-Specific Features**

1. **Mock Data Generation**: Generate realistic test scenarios
2. **Predictable Testing**: Create deterministic test cases
3. **Easy Debugging**: Simplified price logic for easier debugging

## 📝 **Updated subgraph.yaml Configuration**

```yaml
# Remove or simplify Oracle data source
- kind: ethereum
  name: AaveOracle
  network: sepolia
  source:
    address: "0x2da88497588bf89281816106C7259e31AF45a663"
    abi: AaveOracle
    startBlock: 4000000
  mapping:
    kind: ethereum/events
    apiVersion: 0.0.7
    language: wasm/assemblyscript
    entities:
      - TokenPrice
    abis:
      - name: AaveOracle
        file: ./abis/AaveOracle.json
    # Minimal event handlers since prices don't change
    eventHandlers: []
    file: ./src/aave-oracle.ts
```

## 🎯 **Benefits của Strategy này**

### **For Development**:

- ✅ **Predictable Testing**: Giá cố định giúp test logic dễ dàng
- ✅ **Faster Development**: Không cần lo về price volatility
- ✅ **Simplified Debugging**: Ít moving parts hơn

### **For Health Factor Calculations**:

- ✅ **Consistent Results**: HF calculations luôn consistent
- ✅ **Focus on Logic**: Test business logic thay vì price handling
- ✅ **Deterministic Tests**: Kết quả test có thể predict được

### **For UI Testing**:

- ✅ **Stable UI**: UI không bị flicker do price changes
- ✅ **Controlled Scenarios**: Có thể tạo specific test scenarios
- ✅ **User Experience**: Focus vào UX thay vì price accuracy

## 🚀 **Next Steps**

1. **Update Oracle Handlers**: Simplify oracle event handlers
2. **Initialize Static Prices**: Set up known testnet asset prices
3. **Test Health Factor**: Verify HF calculations với static prices
4. **Focus on Pool Events**: Prioritize Aave Pool activity tracking
5. **Prepare for Mainnet**: Design strategy để switch sang real oracles

## 💡 **Production Considerations**

Khi deploy lên mainnet:

1. **Real Oracle Integration**: Switch sang real Chainlink oracles
2. **Dynamic Price Updates**: Handle real price volatility
3. **Event-driven Updates**: Real-time price update events
4. **Robust Error Handling**: Handle oracle failures và stale prices

Với strategy này, chúng ta có thể:

- ✅ Test protocol logic hiệu quả trên testnet
- ✅ Focus vào core functionality thay vì price complexity
- ✅ Prepare sẵn cho mainnet deployment với real oracles
- ✅ Maintain code quality và testing standards

## 🎯 **Dynamic UI Testing Strategy**

### **Problem**: Static prices không cho phép test dynamic UI features như:

- Real-time HF updates
- Order sorting theo HF changes
- Risk level transitions (LOW → MEDIUM → HIGH → CRITICAL)
- Time-to-liquidation countdown
- Price alert notifications

### **Solution**: **Hybrid Testing Approach**

#### **1. Mock Price Simulation trong Subgraph**

```typescript
// Dynamic price simulation for UI testing
function simulatePriceMovement(
  asset: Address,
  basePrice: BigDecimal,
  timestamp: BigInt
): BigDecimal {
  // Create predictable but varying prices based on block timestamp
  let timeVariation = timestamp.mod(BigInt.fromI32(3600)); // 1 hour cycle
  let priceVariation = timeVariation
    .toBigDecimal()
    .div(BigDecimal.fromString("3600"));

  if (
    asset.toHexString().toLowerCase() ==
    "0x29f2d40b0605204364af54ec677bd022da425d03"
  ) {
    // WBTC: Simulate $60,000 ± 10% ($54,000 - $66,000)
    let variation = priceVariation
      .times(BigDecimal.fromString("0.2"))
      .minus(BigDecimal.fromString("0.1"));
    return basePrice.times(BigDecimal.fromString("1").plus(variation));
  } else if (
    asset.toHexString().toLowerCase() ==
    "0xf8fb3713d459d7c1018bd0a49d19b4c44290ebe5"
  ) {
    // LINK: Simulate $15 ± 20% ($12 - $18)
    let variation = priceVariation
      .times(BigDecimal.fromString("0.4"))
      .minus(BigDecimal.fromString("0.2"));
    return basePrice.times(BigDecimal.fromString("1").plus(variation));
  }

  return basePrice; // Stable assets (DAI, USDC) remain fixed
}

// Update prices periodically for dynamic testing
function updateDynamicPrices(blockTimestamp: BigInt): void {
  let assets = [
    "0x29f2D40B0605204364af54EC677bD022dA425d03", // WBTC
    "0xf8Fb3713D459D7C1018BD0A49D19b4C44290EBE5", // LINK
  ];

  for (let i = 0; i < assets.length; i++) {
    let asset = Address.fromString(assets[i]);
    let tokenPrice = TokenPrice.load(asset.toHexString());

    if (tokenPrice != null) {
      let basePrice = tokenPrice.priceUSD;
      let newPrice = simulatePriceMovement(asset, basePrice, blockTimestamp);

      // Only update if price changed significantly (>1%)
      let priceChange = newPrice
        .minus(tokenPrice.priceUSD)
        .div(tokenPrice.priceUSD);
      if (
        priceChange.gt(BigDecimal.fromString("0.01")) ||
        priceChange.lt(BigDecimal.fromString("-0.01"))
      ) {
        tokenPrice.priceUSD = newPrice;
        tokenPrice.lastUpdatedAt = blockTimestamp;
        tokenPrice.save();

        // Create price snapshot for historical tracking
        createPriceSnapshot(asset, newPrice, blockTimestamp, ZERO_BI);

        log.info("Price updated for {}: ${} ({}% change)", [
          tokenPrice.symbol,
          newPrice.toString(),
          priceChange.times(BigDecimal.fromString("100")).toString(),
        ]);
      }
    }
  }
}
```

#### **2. Event-Driven Price Updates**

```typescript
// Update prices on every Aave Pool event for dynamic testing
export function handleAaveSupply(event: SupplyEvent): void {
  // Update dynamic prices first
  updateDynamicPrices(event.block.timestamp);

  // Then process the supply event
  // ... existing supply logic

  // Recalculate all affected position health factors
  recalculateAllHealthFactors(event.block.timestamp);
}

export function handleAaveBorrow(event: BorrowEvent): void {
  updateDynamicPrices(event.block.timestamp);
  // ... existing borrow logic
  recalculateAllHealthFactors(event.block.timestamp);
}

// Recalculate HF for all positions when prices change
function recalculateAllHealthFactors(timestamp: BigInt): void {
  // This would require loading all active positions
  // and recalculating their health factors with new prices
  log.info("Recalculating all health factors due to price update", []);
}
```

#### **3. UI Testing Scenarios**

```typescript
// Create test scenarios for different HF ranges
function createTestScenarios(): void {
  // Scenario 1: Healthy positions (HF > 2.0)
  // Scenario 2: Medium risk (1.3 < HF < 2.0)
  // Scenario 3: High risk (1.1 < HF < 1.3)
  // Scenario 4: Critical risk (HF < 1.1)
  // Simulate different price movements to trigger these scenarios
}
```

### **3. Frontend Testing Strategy**

#### **A. Real-time Price Simulation**

```javascript
// Frontend price simulation for development
const simulateRealTimePrices = () => {
  const basePrice = 60000; // WBTC base price
  const variation = Math.sin(Date.now() / 10000) * 0.1; // ±10% variation
  return basePrice * (1 + variation);
};

// Update UI every 5 seconds with simulated prices
setInterval(() => {
  const newPrice = simulateRealTimePrices();
  updateHealthFactors(newPrice);
  sortOrdersByHealthFactor();
}, 5000);
```

#### **B. GraphQL Subscriptions for Real-time Updates**

```graphql
# Subscribe to position health factor changes
subscription PositionHealthUpdates($userId: String!) {
  positionSnapshots(
    where: { position_: { owner: $userId } }
    orderBy: timestamp
    orderDirection: desc
    first: 1
  ) {
    position {
      id
      healthFactor
      riskLevel
      timeToLiquidation
    }
    timestamp
  }
}

# Subscribe to order executability changes
subscription OrderExecutabilityUpdates {
  orders(
    where: { status: ACTIVE }
    orderBy: lastUpdatedAt
    orderDirection: desc
  ) {
    id
    canExecute
    triggerHF
    position {
      healthFactor
      riskLevel
    }
  }
}
```

#### **C. Dynamic Order Sorting**

```javascript
// Sort orders by health factor proximity to trigger
const sortOrdersByExecutability = (orders) => {
  return orders.sort((a, b) => {
    const aDistance = Math.abs(a.position.healthFactor - a.triggerHF);
    const bDistance = Math.abs(b.position.healthFactor - b.triggerHF);
    return aDistance - bDistance; // Closest to trigger first
  });
};

// Real-time risk level indicators
const getRiskColor = (healthFactor) => {
  if (healthFactor < 1.1) return "red";
  if (healthFactor < 1.3) return "orange";
  if (healthFactor < 2.0) return "yellow";
  return "green";
};
```

### **4. Testing Environment Setup**

#### **Development Mode**:

- Enable dynamic price simulation
- Update prices on every block/event
- Create artificial volatility for testing

#### **Production Mode**:

- Use actual oracle prices (mainnet)
- Real market volatility
- Authentic price feeds

```typescript
// Environment-based price strategy
const isDevelopment = process.env.NODE_ENV === "development";

function getPriceStrategy(): string {
  return isDevelopment ? "SIMULATED" : "ORACLE";
}

function updatePrices(event: any): void {
  if (getPriceStrategy() === "SIMULATED") {
    updateDynamicPrices(event.block.timestamp);
  } else {
    fetchRealOraclePrices();
  }
}
```

### **5. Benefits của Hybrid Approach**

#### **For Development**:

- ✅ **Dynamic UI Testing**: Test real-time updates và sorting
- ✅ **Predictable Scenarios**: Create specific test cases
- ✅ **Performance Testing**: Test UI under rapid price changes
- ✅ **User Experience**: Validate notifications và alerts

#### **For Production**:

- ✅ **Real Market Data**: Authentic price feeds
- ✅ **Proven Logic**: Same calculation logic as development
- ✅ **Smooth Transition**: Easy switch between modes
- ✅ **Reliable Performance**: Battle-tested under simulated load

### **6. Implementation Priority**

1. **Phase 1**: Implement dynamic price simulation in subgraph
2. **Phase 2**: Add real-time HF recalculation on price changes
3. **Phase 3**: Create GraphQL subscriptions for UI updates
4. **Phase 4**: Build dynamic sorting và filtering features
5. **Phase 5**: Add comprehensive testing scenarios

Với approach này, bạn có thể:

- ✅ Test dynamic UI features với simulated price movements
- ✅ Validate real-time HF updates và order sorting
- ✅ Create comprehensive test scenarios cho different risk levels
- ✅ Maintain stability với predictable base prices
- ✅ Easy transition to production với real oracle data
