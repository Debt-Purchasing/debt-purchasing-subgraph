FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV POSTGRES_USER=postgres
ENV POSTGRES_PASSWORD=password
ENV POSTGRES_DB=graph

RUN apt-get update && apt-get install -y \
  wget curl ca-certificates git \
  build-essential cmake pkg-config protobuf-compiler libpq-dev \
  postgresql postgresql-contrib \
  supervisor \
  && rm -rf /var/lib/apt/lists/*

# Install Rust and Graph Node via cargo
RUN curl https://sh.rustup.rs -sSf | bash -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"
RUN cargo install --git https://github.com/graphprotocol/graph-node --tag v0.39.1 graph-node

# Init Postgres
RUN mkdir -p /var/lib/postgresql/data && chown -R postgres:postgres /var/lib/postgresql/data \
 && su postgres -c '/usr/lib/postgresql/14/bin/initdb -D /var/lib/postgresql/data'

COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

EXPOSE 8000 8001 8002 5432

CMD bash -c "\
  service postgresql start && \
  sleep 5 && \
  sudo -u postgres psql -tc \"SELECT 1 FROM pg_database WHERE datname = 'graph'\" | grep -q 1 || \
    sudo -u postgres createdb graph && \
  tail -f /var/log/supervisor/*.log & \
  /usr/bin/supervisord -n"
