FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV POSTGRES_USER=postgres
ENV POSTGRES_PASSWORD=password
ENV POSTGRES_DB=graph

RUN apt-get update && apt-get install -y \
  wget curl ca-certificates \
  postgresql postgresql-contrib \
  supervisor \
  && rm -rf /var/lib/apt/lists/*

# Tải và giải nén binary graph-node
RUN wget -qO graph-node.tar.gz \
     https://github.com/graphprotocol/graph-node/releases/download/v0.36.0/graph-node-v0.36.0-x86_64-unknown-linux-musl.tar.gz \
  && tar -xzf graph-node.tar.gz \
  && mv graph-node-v0.36.0-x86_64-unknown-musl/graph-node /usr/local/bin/graph-node \
  && chmod +x /usr/local/bin/graph-node \
  && rm -rf graph-node.tar.gz graph-node-v0.36.0-*

# Khởi tạo database PostgreSQL
RUN mkdir -p /var/lib/postgresql/data && chown -R postgres:postgres /var/lib/postgresql/data \
 && su postgres -c '/usr/lib/postgresql/14/bin/initdb -D /var/lib/postgresql/data'

# Thêm cấu hình supervisor
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

EXPOSE 8000 8001 8002 5432

# Chạy server: start postgres, tạo database nếu cần, sau đó supervisord
CMD bash -c "\
  service postgresql start && \
  sleep 3 && \
  sudo -u postgres psql -tc \"SELECT 1 FROM pg_database WHERE datname = 'graph'\" | grep -q 1 || \
    sudo -u postgres createdb graph && \
  tail -f /var/log/supervisor/*.log & \
  /usr/bin/supervisord -n"
