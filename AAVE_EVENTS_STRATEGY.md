# Chiến lược lắng nghe Aave Events

## 🎯 **Câu trả lời cho câu hỏi của bạn**

**Có, chúng ta SẼ PHẢI tự lắng nghe các events của Aave contracts!**

Đây là cách duy nhất để có được dữ liệu real-time và chính xác nhất cho protocol của chúng ta.

## 🔄 **Tại sao phải tự lắng nghe?**

### ❌ **Vấn đề với Aave Public Subgraph:**

- **Sepolia không có**: Aave chưa deploy subgraph cho Sepolia testnet
- **Dependency risk**: Phụ thuộc vào infrastructure của bên thứ 3
- **Data lag**: Có thể bị delay hoặc miss events
- **Limited customization**: Không thể tùy chỉnh theo nhu cầu riêng

### ✅ **Lợi ích khi tự lắng nghe:**

- **Real-time data**: Nhận events ngay khi chúng xảy ra
- **Full control**: Kiểm soát hoàn toàn data processing
- **Custom metrics**: Tính toán metrics theo nhu cầu riêng
- **Reliability**: Không phụ thuộc vào external services

## 📋 **Các Aave Events cần lắng nghe**

### 🏦 **Aave Pool Contract Events:**

```solidity
// Core lending events
event Supply(indexed address reserve, address user, indexed address onBehalfOf, uint256 amount, indexed uint16 referralCode)
event Borrow(indexed address reserve, address user, indexed address onBehalfOf, uint256 amount, uint8 interestRateMode, uint256 borrowRate, indexed uint16 referralCode)
event Repay(indexed address reserve, indexed address user, address repayer, uint256 amount, bool useATokens)
event Withdraw(indexed address reserve, indexed address user, address to, uint256 amount)

// Liquidation events
event LiquidationCall(indexed address collateralAsset, indexed address debtAsset, indexed address user, uint256 debtToCover, uint256 liquidatedCollateralAmount, address liquidator, bool receiveAToken)

// Rate mode changes
event SwapBorrowRateMode(indexed address reserve, indexed address user, uint8 interestRateMode)
event RebalanceStableBorrowRate(indexed address reserve, indexed address user)
```

### 💰 **Aave Oracle Events:**

```solidity
event AssetSourceUpdated(indexed address asset, indexed address source)
event FallbackOracleUpdated(indexed address fallbackOracle)
```

## 🏗️ **Implementation Strategy**

### **1. Subgraph Configuration**

```yaml
# subgraph.yaml
dataSources:
  # Our protocol contracts
  - name: AaveRouter
  # ... existing config

  # Aave Pool contract
  - name: AavePool
    source:
      address: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951" # Sepolia
      abi: AavePool
      startBlock: 4000000
    mapping:
      eventHandlers:
        - event: Supply(indexed address,address,indexed address,uint256,indexed uint16)
          handler: handleAaveSupply
        - event: Borrow(indexed address,address,indexed address,uint256,uint8,uint256,indexed uint16)
          handler: handleAaveBorrow
        # ... other events
```

### **2. Event Handlers**

```typescript
// src/aave-pool.ts
export function handleAaveSupply(event: SupplyEvent): void {
  // Update TokenPrice entity
  let tokenPrice = getOrCreateTokenPrice(event.params.reserve);
  tokenPrice.lastUpdatedAt = event.block.timestamp;

  // Create price snapshot for significant transactions
  if (event.params.amount.gt(SIGNIFICANT_AMOUNT_THRESHOLD)) {
    createPriceSnapshot(
      event.params.reserve,
      tokenPrice.priceUSD,
      event.block.timestamp
    );
  }

  // Update protocol metrics
  updateProtocolMetrics(event.block.timestamp);
}
```

### **3. Data Integration**

```typescript
// Trong AaveRouter handlers
export function handleCreateDebt(event: CreateDebtEvent): void {
  // ... existing logic

  // Sync với Aave data
  let position = getOrCreateDebtPosition(event.params.debtContract);

  // Update collateral prices từ Aave events
  updatePositionCollateralPrices(position);

  // Calculate health factor với real-time prices
  calculateHealthFactor(position);
}
```

## 📊 **Data Flow Architecture**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Aave Pool     │    │  AaveRouter     │    │   AaveDebt      │
│   Events        │    │   Events        │    │   Events        │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Subgraph Event Handlers                     │
├─────────────────────────────────────────────────────────────────┤
│  • Price Updates     • Position Changes    • Debt Tracking     │
│  • Liquidations      • Order Executions    • Risk Metrics      │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GraphQL Entities                            │
├─────────────────────────────────────────────────────────────────┤
│  • TokenPrice        • DebtPosition       • Order              │
│  • PriceSnapshot     • ProtocolMetrics    • OrderExecution     │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend Application                        │
├─────────────────────────────────────────────────────────────────┤
│  • Real-time prices  • Position health    • Trading signals    │
│  • Risk alerts       • Performance data   • Analytics          │
└─────────────────────────────────────────────────────────────────┘
```

## 🚀 **Next Steps**

### **Immediate Actions:**

1. **Get Aave ABIs**: Download từ Aave GitHub hoặc Etherscan
2. **Update subgraph.yaml**: Thêm Aave Pool contract
3. **Implement handlers**: Tạo event handlers cho Aave events
4. **Test locally**: Deploy và test trên local node

### **Required Files:**

```
subgraph/
├── abis/
│   ├── AavePool.json          # ✅ Cần thêm
│   ├── AaveOracle.json        # ✅ Cần thêm
│   └── AaveRouter.json        # ✅ Đã có
├── src/
│   ├── aave-pool.ts           # ✅ Đã tạo (cần hoàn thiện)
│   └── aave-router.ts         # ✅ Đã có
└── subgraph.yaml              # ✅ Đã update
```

## 💡 **Pro Tips**

### **Performance Optimization:**

- **Filter events**: Chỉ lắng nghe events của assets quan trọng
- **Batch updates**: Group multiple price updates
- **Threshold filtering**: Chỉ tạo snapshots cho transactions lớn

### **Error Handling:**

- **Graceful degradation**: Fallback khi miss events
- **Data validation**: Validate prices trước khi save
- **Retry logic**: Retry failed operations

### **Monitoring:**

- **Event counts**: Track số lượng events processed
- **Price accuracy**: So sánh với external oracles
- **Performance metrics**: Monitor processing time

## 🎯 **Kết luận**

**Có, chúng ta PHẢI tự lắng nghe Aave events** để có được:

- ✅ Real-time price data
- ✅ Accurate health factor calculations
- ✅ Reliable liquidation monitoring
- ✅ Independent infrastructure

Đây là approach tốt nhất cho production-ready protocol!
