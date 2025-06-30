#!/bin/bash

echo "Starting Debt Purchasing Subgraph container..."

# Setup PostgreSQL directories and permissions
echo "Setting up PostgreSQL..."
PG_VERSION=$(ls /etc/postgresql/)
mkdir -p /var/lib/postgresql/$PG_VERSION/main
chown -R postgres:postgres /var/lib/postgresql/$PG_VERSION
mkdir -p /var/log/postgresql
chown postgres:postgres /var/log/postgresql

# Initialize PostgreSQL if needed
if [ ! -d "/var/lib/postgresql/$PG_VERSION/main/base" ]; then
    echo "Initializing PostgreSQL database..."
    sudo -u postgres /usr/lib/postgresql/$PG_VERSION/bin/initdb -D /var/lib/postgresql/$PG_VERSION/main
fi

# Create C locale database for Graph Node
echo "Setting up Graph Node database..."
sudo -u postgres /usr/lib/postgresql/$PG_VERSION/bin/pg_ctl -D /var/lib/postgresql/$PG_VERSION/main -l /var/log/postgresql/setup.log start
sleep 5

# Create database with C locale (required by Graph Node)
sudo -u postgres createdb -l C -E UTF8 -T template0 graph_node_db 2>/dev/null || echo "Database graph_node_db already exists"

# Verify database locale
sudo -u postgres psql graph_node_db -c "SELECT datcollate FROM pg_database WHERE datname='graph_node_db';" || echo "Database verification failed"

# Stop PostgreSQL (supervisord will restart it)
sudo -u postgres /usr/lib/postgresql/$PG_VERSION/bin/pg_ctl -D /var/lib/postgresql/$PG_VERSION/main stop
sleep 2

# Initialize IPFS
echo "Setting up IPFS..."
export IPFS_PATH="/app/.ipfs"
if [ ! -d "$IPFS_PATH" ]; then
    echo "Initializing IPFS repository..."
    ipfs init --profile server
    # Configure IPFS for local development
    ipfs config Addresses.API /ip4/0.0.0.0/tcp/5001
    ipfs config Addresses.Gateway /ip4/0.0.0.0/tcp/8080
    ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["*"]'
    ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT", "POST"]'
else
    echo "IPFS repository already exists"
fi

# Start supervisord
echo "Starting supervisord..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf 