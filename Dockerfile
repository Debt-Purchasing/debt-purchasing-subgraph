FROM ubuntu:22.04

# ENV
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
  supervisor \
  && rm -rf /var/lib/apt/lists/*

# Install Graph Node binary release (v0.36.0)
RUN wget https://github.com/graphprotocol/graph-node/releases/download/v0.36.0/graph-node-v0.36.0-x86_64-unknown-linux-gnu.tar.gz \
 && tar -xzf graph-node-v0.36.0-x86_64-unknown-linux-gnu.tar.gz \
 && mv graph-node /usr/local/bin/graph-node \
 && chmod +x /usr/local/bin/graph-node

# Init Postgres DB (manual init because we don’t use systemd)
RUN su postgres -c '/usr/lib/postgresql/14/bin/initdb -D /var/lib/postgresql/data'

# Copy supervisord config
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

EXPOSE 8000 8001 8002 5432

# Show logs & run
CMD tail -f /var/log/supervisor/*.log & /usr/bin/supervisord -n
