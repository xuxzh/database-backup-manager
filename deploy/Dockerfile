FROM node:24-bookworm AS web-builder
WORKDIR /app/web
RUN corepack enable
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY web ./
RUN pnpm build

FROM rust:1.94-bookworm AS builder
WORKDIR /app
COPY Cargo.toml Cargo.toml
COPY crates crates
RUN cargo build --release -p backup-manager

FROM debian:bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl unzip libunwind8 default-mysql-client postgresql-client openssh-client rsync sshpass gzip \
  && curl -fsSL -O https://packages.microsoft.com/config/debian/12/packages-microsoft-prod.deb \
  && dpkg -i packages-microsoft-prod.deb \
  && rm packages-microsoft-prod.deb \
  && apt-get update \
  && ACCEPT_EULA=Y apt-get install -y --no-install-recommends mssql-tools18 unixodbc-dev \
  && mkdir -p /opt/sqlpackage \
  && curl -fsSL https://aka.ms/sqlpackage-linux -o /tmp/sqlpackage.zip \
  && unzip -q /tmp/sqlpackage.zip -d /opt/sqlpackage \
  && chmod +x /opt/sqlpackage/sqlpackage \
  && rm /tmp/sqlpackage.zip \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/backup-manager /usr/local/bin/backup-manager
COPY --from=web-builder /app/web/dist /app/web/dist
ENV DATA_DIR=/app/data \
    BACKUPS_DIR=/app/backups \
    BIND_ADDR=0.0.0.0:8080 \
    PATH="/opt/mssql-tools18/bin:/opt/sqlpackage:${PATH}"
EXPOSE 8080
CMD ["backup-manager"]
