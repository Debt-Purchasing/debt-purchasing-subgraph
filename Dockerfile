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

# Install IPFS
RUN wget https://dist.ipfs.tech/kubo/v0.17.0/kubo_v0.17.0_linux-amd64.tar.gz \
    && tar -xzf kubo_v0.17.0_linux-amd64.tar.gz \
    && cd kubo && ./install.sh \
    && rm -rf /kubo_v0.17.0_linux-amd64.tar.gz /kubo

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
    printf '# PostgreSQL Client Authentication Configuration File\n\
# Trust authentication for Graph Node (MUST be first)\n\
local all all trust\n\
host all all 127.0.0.1/32 trust\n\
host all all ::1/128 trust\n\
host all all 0.0.0.0/0 trust\n\
\n\
# Database administrative login by Unix domain socket\n\
local   all             postgres                                peer\n\
\n\
# TYPE  DATABASE        USER            ADDRESS                 METHOD\n\
# Allow replication connections from localhost, by a user with the\n\
# replication privilege.\n\
local   replication     all                                     peer\n\
host    replication     all             127.0.0.1/32            md5\n\
host    replication     all             ::1/128                 md5\n' > /etc/postgresql/$PG_VERSION/main/pg_hba.conf && \
    echo "listen_addresses='*'" >> /etc/postgresql/$PG_VERSION/main/postgresql.conf

# Create entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Set environment variables
ENV DATABASE_URL="postgresql://postgres:@localhost:5432/graph_node_db"
ENV ETHEREUM_RPC="sepolia:https://sepolia.drpc.org"
ENV IPFS_URL="http://localhost:5001"
ENV RUST_LOG="info"
ENV GRAPH_LOG="info"
ENV PORT=8000

# Expose ports
EXPOSE 8000 8001 8020 8030 8040 5001 8080

# Use entrypoint script
CMD ["/app/entrypoint.sh"] 