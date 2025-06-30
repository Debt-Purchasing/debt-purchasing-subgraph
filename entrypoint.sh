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

# Start supervisord
echo "Starting supervisord..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf 