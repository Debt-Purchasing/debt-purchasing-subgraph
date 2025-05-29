# Debt Purchasing Protocol - Subgraph

This subgraph indexes events from the Debt Purchasing Protocol, specifically tracking AaveRouter and AaveDebt contracts to provide real-time data for the protocol's frontend and analytics.

## 🎯 Purpose

The subgraph moves heavy calculations server-side, providing:

- Real-time position tracking and health factor monitoring
- Order management and execution history
- User analytics and protocol metrics
- Pre-calculated values for optimal UI performance

## 📊 Tracked Events

### AaveRouter Events

- `CreateDebt` - New debt position creation
- `TransferDebtOwnership` - Position ownership transfers
- `CancelCurrentDebtOrders` - Order cancellations
- `Supply` - Collateral deposits
- `Borrow` - Debt borrowing
- `Withdraw` - Collateral withdrawals
- `Repay` - Debt repayments
- `ExecuteFullSaleOrder` - Full position sales
- `ExecutePartialSellOrder` - Partial position sales

### AaveDebt Events

- Currently no direct events (uses template for future extensibility)

## 🏗️ Architecture

### Entities

- **User** - User accounts and activity tracking
- **DebtPosition** - Individual debt positions with health metrics
- **Order** - Buy/sell orders with real-time calculations
- **OrderExecution** - Executed order details and performance
- **Transaction** - On-chain transaction records
- **ProtocolMetrics** - Overall protocol statistics

### Key Features

- Real-time health factor calculations
- Order profitability analysis
- Historical position snapshots
- Gas usage tracking
- Risk level assessments

## 🚀 Setup & Deployment

### Prerequisites

```bash
npm install -g @graphprotocol/graph-cli
```

### Installation

```bash
cd subgraph
npm install
```

### Configuration

1. **Update Network Configuration**
   Edit `config/sepolia.json` or `config/mainnet.json`:

   ```json
   {
     "network": "sepolia",
     "aaveRouterAddress": "0xYourDeployedAaveRouterAddress",
     "aaveRouterStartBlock": 12345678
   }
   ```

2. **Generate subgraph.yaml**

   ```bash
   # For Sepolia
   npm run prepare:sepolia

   # For Mainnet
   npm run prepare:mainnet
   ```

### Build & Deploy

1. **Generate Types**

   ```bash
   npm run codegen
   ```

2. **Build Subgraph**

   ```bash
   npm run build
   ```

3. **Deploy to The Graph**

   ```bash
   # Create subgraph (first time only)
   graph create --node https://api.thegraph.com/deploy/ your-username/debt-purchasing-subgraph

   # Deploy
   graph deploy --node https://api.thegraph.com/deploy/ --ipfs https://api.thegraph.com/ipfs/ your-username/debt-purchasing-subgraph
   ```

### Local Development

1. **Start Local Graph Node**

   ```bash
   # Clone graph-node repository and run with Docker
   git clone https://github.com/graphprotocol/graph-node
   cd graph-node/docker
   docker-compose up
   ```

2. **Deploy Locally**
   ```bash
   npm run create-local
   npm run deploy-local
   ```

## 📈 Usage Examples

### Query User Positions

```graphql
query GetUserPositions($user: String!) {
  user(id: $user) {
    totalPositions
    totalVolumeTraded
    positions {
      id
      healthFactor
      totalCollateralUSD
      totalDebtUSD
      riskLevel
      activeOrders {
        id
        type
        triggerHF
        canExecute
      }
    }
  }
}
```

### Query Active Orders

```graphql
query GetActiveOrders {
  orders(where: { status: ACTIVE, canExecute: true }) {
    id
    type
    position {
      id
      healthFactor
      owner {
        id
      }
    }
    triggerHF
    estimatedProfit
    profitMargin
  }
}
```

### Query Protocol Metrics

```graphql
query GetProtocolMetrics {
  protocolMetrics(id: "protocol") {
    totalPositions
    totalActiveOrders
    totalVolumeUSD
    totalUsers
    lastUpdatedAt
  }
}
```

## 🔧 Development

### Adding New Events

1. Update `schema.graphql` with new entities
2. Add event handlers in `src/aave-router.ts`
3. Update `subgraph.yaml` event mappings
4. Run `npm run codegen` and `npm run build`

### Testing

```bash
npm run test
```

### Debugging

- Check subgraph logs in The Graph Studio
- Use GraphiQL interface for query testing
- Monitor indexing status and sync progress

## 📁 File Structure

```
subgraph/
├── src/
│   ├── aave-router.ts      # Main event handlers
│   └── aave-debt.ts        # Debt contract handlers
├── abis/
│   ├── AaveRouter.json     # ABI files
│   └── AaveDebt.json
├── config/
│   ├── sepolia.json        # Network configs
│   └── mainnet.json
├── schema.graphql          # GraphQL schema
├── subgraph.yaml          # Subgraph manifest
├── subgraph.template.yaml # Template for multi-network
└── package.json           # Dependencies and scripts
```

## 🔗 Integration

The subgraph provides a GraphQL endpoint that can be integrated into:

- Frontend applications for real-time data
- Analytics dashboards
- Trading bots and automation
- Risk monitoring systems

## 📝 Notes

- Update contract addresses in config files after deployment
- Monitor subgraph sync status for real-time data accuracy
- Consider rate limiting for high-frequency queries
- Health factor calculations require Aave oracle integration (TODO)
- Order profitability calculations need price feed integration (TODO)

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Add tests for new functionality
4. Submit pull request with detailed description

## 📄 License

MIT License - see main project LICENSE file
