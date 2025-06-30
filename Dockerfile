FROM debian:bullseye-slim

# Set non-interactive mode to avoid prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    gnupg \
    lsb-release \
    ca-certificates \
    software-properties-common \
    supervisor \
    postgresql \
    postgresql-contrib \
    sudo \
    build-essential \
    pkg-config \
    libssl-dev \
    protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js (needed for Graph Node)
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# Copy Graph Node binary from official Docker image
COPY --from=graphprotocol/graph-node:v0.35.1 /usr/local/bin/graph-node /usr/local/bin/graph-node

# Create app directory
WORKDIR /app

# Copy supervisord configuration
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Copy subgraph files
COPY . .

# Install subgraph dependencies
RUN npm install

# Create log directories
RUN mkdir -p /var/log/supervisor

# Configure PostgreSQL (find correct version)
RUN PG_VERSION=$(ls /etc/postgresql/) && \
    echo "host all all 0.0.0.0/0 md5" >> /etc/postgresql/$PG_VERSION/main/pg_hba.conf && \
    echo "listen_addresses='*'" >> /etc/postgresql/$PG_VERSION/main/postgresql.conf

# Create init script for PostgreSQL
COPY init-postgres.sh /app/init-postgres.sh
RUN chmod +x /app/init-postgres.sh

# Create entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Set environment variables
ENV DATABASE_URL="postgresql://postgres@localhost:5432/postgres"
ENV ETHEREUM_RPC="sepolia:https://eth-sepolia.g.alchemy.com/v2/PoCLQrNqYS_AT_HdUsPdBzOD1I067hLd"
ENV IPFS_URL="https://ipfs.thegraph.com"
ENV RUST_LOG="info"
ENV GRAPH_LOG="info"
ENV PORT="8000"

# Expose ports
EXPOSE 8000 8001 8020 8030 8040

# Use entrypoint script
CMD ["/app/entrypoint.sh"] 