FROM node:24-bookworm AS web-builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter backup-manager-web...
COPY apps/web apps/web
RUN pnpm -C apps/web build

FROM rust:1.94-bookworm AS builder
WORKDIR /app
COPY Cargo.toml Cargo.toml
COPY crates crates
RUN cargo build --release -p backup-manager

FROM debian:bookworm-slim
ARG POSTGRES_CLIENT_MAJOR=17
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg default-mysql-client openssh-client rsync sshpass gzip \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
  && curl -fsSL -O https://packages.microsoft.com/config/debian/12/packages-microsoft-prod.deb \
  && dpkg -i packages-microsoft-prod.deb \
  && rm packages-microsoft-prod.deb \
  && apt-get update \
  && ACCEPT_EULA=Y apt-get install -y --no-install-recommends postgresql-client-${POSTGRES_CLIENT_MAJOR} mssql-tools18 unixodbc dotnet-sdk-10.0 \
  && dotnet tool install --global microsoft.sqlpackage \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/backup-manager /usr/local/bin/backup-manager
COPY --from=web-builder /app/apps/web/dist /app/apps/web/dist
ENV DATA_DIR=/app/data \
    BACKUPS_DIR=/app/backups \
    BIND_ADDR=0.0.0.0:8080 \
    DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    PATH="/opt/mssql-tools18/bin:/root/.dotnet/tools:${PATH}"
EXPOSE 8080
CMD ["backup-manager"]
