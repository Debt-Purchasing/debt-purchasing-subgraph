#!/bin/bash

# Create postgres user home directory and data directory
mkdir -p /var/lib/postgresql/14/main
chown -R postgres:postgres /var/lib/postgresql/14
mkdir -p /var/log/postgresql
chown postgres:postgres /var/log/postgresql

# Initialize PostgreSQL if not already done
if [ ! -d "/var/lib/postgresql/14/main/base" ]; then
    echo "Initializing PostgreSQL database..."
    sudo -u postgres /usr/lib/postgresql/14/bin/initdb -D /var/lib/postgresql/14/main
fi

# Start PostgreSQL temporarily to create user and database
echo "Starting PostgreSQL temporarily..."
sudo -u postgres /usr/lib/postgresql/14/bin/pg_ctl -D /var/lib/postgresql/14/main -l /var/log/postgresql/postgresql.log start

# Wait for PostgreSQL to start
sleep 10

# Create graph-node user and database if they don't exist
echo "Creating graph-node user and database..."
sudo -u postgres psql -c "SELECT 1 FROM pg_user WHERE usename = 'graph-node'" | grep -q 1 || \
sudo -u postgres psql -c "CREATE USER \"graph-node\" WITH ENCRYPTED PASSWORD 'password';"

sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw graph-node || \
sudo -u postgres psql -c "CREATE DATABASE \"graph-node\" OWNER \"graph-node\";"

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE \"graph-node\" TO \"graph-node\";"

echo "PostgreSQL setup completed."

# Stop PostgreSQL (supervisord will start it properly)
sudo -u postgres /usr/lib/postgresql/14/bin/pg_ctl -D /var/lib/postgresql/14/main stop

echo "PostgreSQL initialization finished." 