.PHONY: help run dev dev-backend dev-web web-build web-dev e2e cargo-run build test fmt clippy docker-up

help:
	@echo "Available targets:"
	@echo "  make run         Build web assets, then start the Rust service"
	@echo "  make dev         Start backend and Vite dev server in parallel"
	@echo "  make dev-backend Start only the Rust backend"
	@echo "  make dev-web     Start only the Vite dev server"
	@echo "  make web-build   Build frontend production assets"
	@echo "  make e2e         Run end-to-end tests"
	@echo "  make build       Build frontend assets and Rust workspace"
	@echo "  make test        Run Rust and frontend tests"
	@echo "  make fmt         Format Rust code"
	@echo "  make clippy      Run Rust clippy checks"
	@echo "  make docker-up   Start the Docker Compose stack"

run: web-build
	cargo run -p backup-manager

dev:
	$(MAKE) -j2 dev-backend dev-web

dev-backend:
	cargo run -p backup-manager

dev-web:
	pnpm -C apps/web dev

web-build:
	pnpm -C apps/web build

web-dev: dev-web

cargo-run: dev-backend

build: web-build
	cargo build

test:
	cargo test
	pnpm -C apps/web test

e2e:
	pnpm e2e

fmt:
	cargo fmt

clippy:
	cargo clippy --all-targets --all-features

docker-up:
	cd deploy && docker compose up --build
