# Railway Deployment Guide for Debt Purchasing Subgraph

## Overview

This guide walks through deploying a self-hosted Graph Node for the Debt Purchasing Subgraph on Railway.

## Prerequisites

- Railway account (sign up at railway.app)
- GitHub repository with subgraph code
- Docker issue resolved (Factory reset Docker Desktop if needed)

## Architecture

```
GitHub → Railway → PostgreSQL + Graph Node → Subgraph Deployment
```

## Step 1: Railway PostgreSQL Database Setup

1. **Create New Project**

   - Go to Railway dashboard
   - Click "New Project"
   - Select "Empty Project"

2. **Add PostgreSQL Database**

   - Click "Create" in your project
   - Select "Database" → "Add PostgreSQL"
   - Wait for deployment to complete

3. **Note Database Variables**
   - Click on PostgreSQL service
   - Go to "Variables" tab
   - Copy `DATABASE_URL` for later use

## Step 2: Deploy Graph Node

1. **Create Graph Node Service**

   - Click "Create" in your project
   - Select "GitHub Repo"
   - Connect and select your subgraph repository
   - Railway will auto-detect Dockerfile

2. **Configure Environment Variables**
   Add these variables in Graph Node service "Variables" tab:

   ```
   DATABASE_URL=${PostgreSQL.DATABASE_URL}
   ETHEREUM_RPC=sepolia:https://eth-sepolia.g.alchemy.com/v2/PoCLQrNqYS_AT_HdUsPdBzOD1I067hLd
   IPFS_URL=https://ipfs.thegraph.com
   RUST_LOG=info
   GRAPH_LOG=info
   POSTGRES_HOST=${PostgreSQL.PGHOST}
   POSTGRES_USER=${PostgreSQL.PGUSER}
   POSTGRES_PASSWORD=${PostgreSQL.PGPASSWORD}
   POSTGRES_DB=${PostgreSQL.PGDATABASE}
   ```

3. **Configure Networking**
   - Go to Graph Node service "Settings"
   - Scroll to "Networking"
   - Click "Generate Domain"
   - Note the public domain for GraphQL queries

## Step 3: Deploy Subgraph

1. **Prepare Subgraph Configuration**

   - Update `config/sepolia.json` with deployed contract addresses
   - Run locally: `npm run prepare:sepolia` to generate `subgraph.yaml`

2. **Install Graph CLI** (if not installed)

   ```bash
   npm install -g @graphprotocol/graph-cli
   ```

3. **Deploy Subgraph**

   ```bash
   # Create subgraph
   graph create --node https://your-railway-domain.railway.app/admin debt-purchasing-subgraph

   # Deploy subgraph
   graph deploy --node https://your-railway-domain.railway.app/admin --ipfs https://ipfs.thegraph.com debt-purchasing-subgraph
   ```

## Step 4: Testing and Verification

1. **Check Graph Node Status**

   - Visit `https://your-domain.railway.app:8030/graphql/playground`
   - Run indexing status query:

   ```graphql
   query {
     indexingStatuses {
       subgraph
       synced
       health
       fatalError {
         message
       }
       chains {
         network
         latestBlock {
           number
         }
         chainHeadBlock {
           number
         }
       }
     }
   }
   ```

2. **Test GraphQL Queries**
   - Visit `https://your-domain.railway.app:8000/subgraphs/name/debt-purchasing-subgraph`
   - Test basic queries:
   ```graphql
   query {
     users(first: 5) {
       id
       totalPositions
       totalVolumeTraded
     }
   }
   ```

## Step 5: Monitoring and Maintenance

1. **Monitor Logs**

   - Check Railway service logs for errors
   - Monitor PostgreSQL resource usage

2. **Performance Optimization**

   - Adjust `pool_size` in `railway.config.toml` based on load
   - Monitor memory usage and scale if needed

3. **Updates and Maintenance**

   - Push to GitHub to trigger automatic redeployment
   - Use `graphman` commands for maintenance:

   ```bash
   # Access Graph Node container
   railway shell

   # Check subgraph status
   graphman stats show <deployment-id>
   ```

## Environment Variables Reference

| Variable       | Description                  | Example                                            |
| -------------- | ---------------------------- | -------------------------------------------------- |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db`              |
| `ETHEREUM_RPC` | Ethereum RPC endpoint        | `sepolia:https://eth-sepolia.g.alchemy.com/v2/...` |
| `IPFS_URL`     | IPFS endpoint                | `https://ipfs.thegraph.com`                        |
| `RUST_LOG`     | Rust logging level           | `info`                                             |
| `GRAPH_LOG`    | Graph Node logging level     | `info`                                             |

## Troubleshooting

### Common Issues:

1. **Graph Node not starting**

   - Check DATABASE_URL is correct
   - Verify PostgreSQL is healthy
   - Check logs for connection errors

2. **Subgraph deployment fails**

   - Verify contract addresses in config
   - Check IPFS connectivity
   - Ensure start block is correct

3. **Slow indexing**

   - Check Ethereum RPC rate limits
   - Monitor PostgreSQL performance
   - Consider using archive node

4. **Memory issues**
   - Reduce `block_cache_size` and `call_cache_size`
   - Scale Railway service to higher memory tier

### Contact and Support:

- Railway Documentation: https://docs.railway.app
- Graph Protocol Discord: https://discord.gg/vtvv7FP
- Project Issues: Create issue in GitHub repository

## Cost Considerations

- Railway Free Tier: \$5 credit (limited time)
- PostgreSQL: ~\$5-10/month depending on usage
- Graph Node: ~\$5-20/month depending on traffic
- Monitor usage to avoid unexpected charges

## Security Notes

- Keep private keys secure
- Use environment variables for sensitive data
- Regularly update dependencies
- Monitor access logs
