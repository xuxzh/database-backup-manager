FROM rust:1.94-bookworm AS builder
WORKDIR /app
COPY Cargo.toml Cargo.toml
COPY crates crates
RUN cargo build --release -p backup-manager

FROM debian:bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates default-mysql-client postgresql-client openssh-client rsync gzip \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/backup-manager /usr/local/bin/backup-manager
COPY web /app/web
ENV DATA_DIR=/app/data \
    BACKUPS_DIR=/app/backups \
    BIND_ADDR=0.0.0.0:8080
EXPOSE 8080
CMD ["backup-manager"]
