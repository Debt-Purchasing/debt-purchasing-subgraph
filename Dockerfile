FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV POSTGRES_USER=postgres
ENV POSTGRES_PASSWORD=password
ENV POSTGRES_DB=graph

# Install dependencies
RUN apt-get update && apt-get install -y \
  wget curl gnupg lsb-release \
  postgresql postgresql-contrib \
  ca-certificates \
  libssl-dev pkg-config build-essential \
  git cmake protobuf-compiler libpq-dev \
  supervisor sudo \
  && rm -rf /var/lib/apt/lists/*

# Install Rust and Graph Node
RUN curl https://sh.rustup.rs -sSf | bash -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"
RUN cargo install --git https://github.com/graphprotocol/graph-node graph-node

# Create dirs
RUN mkdir -p /var/log/supervisor /var/lib/postgresql/data
RUN chown -R postgres:postgres /var/lib/postgresql

# Init Postgres DB properly
RUN su postgres -c '/usr/lib/postgresql/14/bin/initdb -D /var/lib/postgresql/data'

# Copy supervisord config
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

EXPOSE 8000 8001 8002 5432

CMD service postgresql start && \
    sleep 3 && \
    sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = 'graph'" | grep -q 1 || \
    sudo -u postgres createdb graph && \
    /usr/bin/supervisord -n
