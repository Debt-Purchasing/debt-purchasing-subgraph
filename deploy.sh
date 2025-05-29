#!/bin/bash

# Debt Purchasing Protocol - Subgraph Deployment Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
NETWORK="sepolia"
SUBGRAPH_NAME="debt-purchasing-subgraph"
GRAPH_NODE_URL="https://api.thegraph.com/deploy/"
IPFS_URL="https://api.thegraph.com/ipfs/"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --network)
      NETWORK="$2"
      shift 2
      ;;
    --name)
      SUBGRAPH_NAME="$2"
      shift 2
      ;;
    --local)
      GRAPH_NODE_URL="http://localhost:8020/"
      IPFS_URL="http://localhost:5001"
      shift
      ;;
    --help)
      echo "Usage: $0 [OPTIONS]"
      echo "Options:"
      echo "  --network NETWORK    Network to deploy to (sepolia, mainnet) [default: sepolia]"
      echo "  --name NAME          Subgraph name [default: debt-purchasing-subgraph]"
      echo "  --local              Deploy to local graph node"
      echo "  --help               Show this help message"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

echo -e "${GREEN}🚀 Deploying Debt Purchasing Protocol Subgraph${NC}"
echo -e "${YELLOW}Network: $NETWORK${NC}"
echo -e "${YELLOW}Subgraph: $SUBGRAPH_NAME${NC}"
echo ""

# Check if config file exists
CONFIG_FILE="config/${NETWORK}.json"
if [ ! -f "$CONFIG_FILE" ]; then
  echo -e "${RED}❌ Configuration file not found: $CONFIG_FILE${NC}"
  echo "Please create the configuration file with the deployed contract addresses."
  exit 1
fi

# Check if contract address is set
ROUTER_ADDRESS=$(jq -r '.aaveRouterAddress' "$CONFIG_FILE")
if [ "$ROUTER_ADDRESS" = "0x0000000000000000000000000000000000000000" ]; then
  echo -e "${RED}❌ AaveRouter address not set in $CONFIG_FILE${NC}"
  echo "Please update the configuration file with the actual deployed contract address."
  exit 1
fi

echo -e "${GREEN}✅ Configuration validated${NC}"

# Generate subgraph.yaml from template
echo -e "${YELLOW}📝 Generating subgraph.yaml...${NC}"
if ! command -v mustache &> /dev/null; then
  echo -e "${RED}❌ mustache command not found. Installing...${NC}"
  npm install -g mustache
fi

mustache "$CONFIG_FILE" subgraph.template.yaml > subgraph.yaml
echo -e "${GREEN}✅ subgraph.yaml generated${NC}"

# Install dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm install
echo -e "${GREEN}✅ Dependencies installed${NC}"

# Generate types
echo -e "${YELLOW}🔧 Generating types...${NC}"
npm run codegen
echo -e "${GREEN}✅ Types generated${NC}"

# Build subgraph
echo -e "${YELLOW}🏗️  Building subgraph...${NC}"
npm run build
echo -e "${GREEN}✅ Subgraph built${NC}"

# Deploy subgraph
echo -e "${YELLOW}🚀 Deploying subgraph...${NC}"
if [[ "$GRAPH_NODE_URL" == "http://localhost:8020/" ]]; then
  # Local deployment
  echo -e "${YELLOW}📍 Deploying to local graph node...${NC}"
  
  # Create subgraph if it doesn't exist
  graph create --node "$GRAPH_NODE_URL" "$SUBGRAPH_NAME" || true
  
  # Deploy
  graph deploy --node "$GRAPH_NODE_URL" --ipfs "$IPFS_URL" "$SUBGRAPH_NAME"
else
  # Remote deployment
  echo -e "${YELLOW}📍 Deploying to The Graph...${NC}"
  echo -e "${YELLOW}Note: Make sure you have authenticated with 'graph auth'${NC}"
  
  graph deploy --node "$GRAPH_NODE_URL" --ipfs "$IPFS_URL" "$SUBGRAPH_NAME"
fi

echo ""
echo -e "${GREEN}🎉 Subgraph deployment completed!${NC}"
echo ""
echo -e "${YELLOW}📊 Subgraph Details:${NC}"
echo -e "Name: $SUBGRAPH_NAME"
echo -e "Network: $NETWORK"
echo -e "Router Address: $ROUTER_ADDRESS"
echo ""

if [[ "$GRAPH_NODE_URL" == "http://localhost:8020/" ]]; then
  echo -e "${YELLOW}🔗 Local GraphQL Endpoint:${NC}"
  echo -e "http://localhost:8000/subgraphs/name/$SUBGRAPH_NAME"
else
  echo -e "${YELLOW}🔗 The Graph Studio:${NC}"
  echo -e "https://thegraph.com/studio/subgraph/$SUBGRAPH_NAME"
fi

echo ""
echo -e "${GREEN}✅ Deployment successful!${NC}" 