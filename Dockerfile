FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# 1. Cài các package cần thiết
RUN apt-get update && apt-get install -y \
    wget curl ca-certificates \
    postgresql postgresql-contrib \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

# 2. Cài Graph Node binary (v0.38.0)
RUN wget -qO graph-node.tar.gz \
    https://github.com/graphprotocol/graph-node/releases/download/v0.38.0/graph-node-v0.38.0-x86_64-unknown-linux-musl.tar.gz \
    && tar -xzf graph-node.tar.gz \
    && mv graph-node-v0.38.0-x86_64-unknown-linux-musl/graph-node /usr/local/bin/graph-node \
    && chmod +x /usr/local/bin/graph-node \
    && rm -rf graph-node.tar.gz graph-node-v0.38.0-*

# 3. Tạo thư mục Postgres data
RUN mkdir -p /var/lib/postgresql/data && chown -R postgres:postgres /var/lib/postgresql/data

# 4. Init Postgres
RUN su postgres -c '/usr/lib/postgresql/14/bin/initdb -D /var/lib/postgresql/data'

# 5. Copy cấu hình supervisor
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# 6. Expose các cổng dịch vụ
EXPOSE 8000 8001 8002 5432

# 7. Start supervisor
CMD ["/usr/bin/supervisord", "-n"]
