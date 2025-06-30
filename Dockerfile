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

# Add postgres user manually
RUN useradd -m postgres

# Install Rust & Graph Node
RUN curl https://sh.rustup.rs -sSf | bash -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"
RUN cargo install --git https://github.com/graphprotocol/graph-node graph-node

# Prepare folders
RUN mkdir -p /var/lib/postgresql/data \
    && mkdir -p /var/log/supervisor

COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

EXPOSE 8000 8001 8002 5432

CMD ["/usr/bin/supervisord", "-n"]
