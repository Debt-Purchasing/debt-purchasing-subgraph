#!/bin/bash

echo "Starting Debt Purchasing Subgraph container..."

# Check if running in Railway with external PostgreSQL
if [ -n "$RAILWAY_ENVIRONMENT" ] && [ -n "$DATABASE_URL" ] && [[ "$DATABASE_URL" != *"localhost"* ]]; then
    echo "🚂 Railway environment detected with external PostgreSQL"
    echo "Using external database: $DATABASE_URL"
    
    # Skip local PostgreSQL setup - use external database
    echo "Skipping local PostgreSQL setup..."
    
else
    echo "🐳 Local environment or Railway with internal PostgreSQL"
    
    # Setup PostgreSQL directories and permissions
    echo "Setting up PostgreSQL..."
    PG_VERSION=$(ls /etc/postgresql/)
    echo "PostgreSQL version: $PG_VERSION"

    # Create directories with proper permissions
    mkdir -p /var/lib/postgresql/$PG_VERSION/main
    mkdir -p /var/log/postgresql
    mkdir -p /var/run/postgresql

    # Set ownership
    chown -R postgres:postgres /var/lib/postgresql/$PG_VERSION
    chown -R postgres:postgres /var/log/postgresql  
    chown -R postgres:postgres /var/run/postgresql

    # Initialize PostgreSQL if needed
    if [ ! -d "/var/lib/postgresql/$PG_VERSION/main/base" ]; then
        echo "Initializing PostgreSQL database..."
        sudo -u postgres /usr/lib/postgresql/$PG_VERSION/bin/initdb -D /var/lib/postgresql/$PG_VERSION/main --locale=C --encoding=UTF8
    fi

    # Create C locale database for Graph Node
    echo "Setting up Graph Node database..."

    # Start PostgreSQL temporarily with explicit settings
    echo "Starting PostgreSQL temporarily..."
    sudo -u postgres /usr/lib/postgresql/$PG_VERSION/bin/pg_ctl -D /var/lib/postgresql/$PG_VERSION/main -l /var/log/postgresql/setup.log -o "-F -p 5432" start

    # Wait for PostgreSQL to be ready
    echo "Waiting for PostgreSQL to be ready..."
    for i in {1..30}; do
        if sudo -u postgres /usr/lib/postgresql/$PG_VERSION/bin/pg_isready -p 5432; then
            echo "PostgreSQL is ready!"
            break
        fi
        echo "Attempt $i: PostgreSQL not ready, waiting..."
        sleep 2
    done

    # Create database with C locale (required by Graph Node)
    echo "Creating Graph Node database..."
    sudo -u postgres createdb -p 5432 -l C -E UTF8 -T template0 graph_node_db 2>/dev/null || echo "Database graph_node_db already exists"

    # Verify database locale
    echo "Verifying database configuration..."
    sudo -u postgres psql -p 5432 graph_node_db -c "SELECT datcollate FROM pg_database WHERE datname='graph_node_db';" 2>/dev/null || echo "Database verification completed"

    # Stop PostgreSQL (supervisord will restart it)
    echo "Stopping temporary PostgreSQL instance..."
    sudo -u postgres /usr/lib/postgresql/$PG_VERSION/bin/pg_ctl -D /var/lib/postgresql/$PG_VERSION/main stop 2>/dev/null || echo "PostgreSQL stopped"
    sleep 3
fi

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
    echo "IPFS configured successfully"
else
    echo "IPFS repository already exists"
fi

# Print environment info
echo "🔧 Environment Summary:"
echo "   RAILWAY_ENVIRONMENT: ${RAILWAY_ENVIRONMENT:-'not set'}"
echo "   DATABASE_URL: ${DATABASE_URL:-'not set'}"
echo "   ETHEREUM_RPC: ${ETHEREUM_RPC:-'not set'}"
echo "   IPFS_URL: ${IPFS_URL:-'not set'}"

# Create appropriate supervisord config based on database setup
if [ -n "$RAILWAY_ENVIRONMENT" ] && [ -n "$DATABASE_URL" ] && [[ "$DATABASE_URL" != *"localhost"* ]]; then
    echo "🚂 Creating Railway supervisord config (no local PostgreSQL)"
    
    # Create supervisord config without PostgreSQL
    cat > /etc/supervisor/conf.d/supervisord.conf << 'EOF'
[supervisord]
nodaemon=true
logfile=/var/log/supervisor/supervisord.log
pidfile=/var/run/supervisord.pid
childlogdir=/var/log/supervisor

[program:ipfs]
command=ipfs daemon --enable-gc
directory=/app
autostart=true
autorestart=true
stderr_logfile=/var/log/supervisor/ipfs_stderr.log
stdout_logfile=/var/log/supervisor/ipfs_stdout.log
priority=1
environment=IPFS_PATH="/app/.ipfs"
startsecs=5

[program:graph-node]
command=bash -c 'sleep 15 && graph-node --postgres-url %(ENV_DATABASE_URL)s --ethereum-rpc %(ENV_ETHEREUM_RPC)s --ipfs %(ENV_IPFS_URL)s --http-port 8000 --ws-port 8001 --admin-port 8020 --index-node-port 8030 --metrics-port 8040 --node-id default --http-host 0.0.0.0'
directory=/app
autostart=true
autorestart=true
stderr_logfile=/var/log/supervisor/graph_node_stderr.log
stdout_logfile=/var/log/supervisor/graph_node_stdout.log
priority=2
depends_on=ipfs
startsecs=30
environment=LANG="C",LC_ALL="C",LC_COLLATE="C",LC_CTYPE="C"

[unix_http_server]
file=/var/run/supervisor.sock

[supervisorctl]
serverurl=unix:///var/run/supervisor.sock

[rpcinterface:supervisor]
supervisor.rpcinterface_factory = supervisor.rpcinterface:make_main_rpcinterface
EOF

else
    echo "🐳 Using existing supervisord config (with local PostgreSQL)"
fi

# Start supervisord
echo "Starting supervisord..."
echo "All services will be managed by supervisord from now on"
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf 