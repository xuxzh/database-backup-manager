mod adapters;
mod api;
mod auth;
mod config;
mod crypto;
mod domain;
mod executor;
mod repository;
mod scheduler;

use std::{net::SocketAddr, sync::Arc};

use anyhow::Context;
use axum::Router;
use sqlx::sqlite::SqlitePoolOptions;
use tokio::fs;
use tower_http::{
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::{
    adapters::{database::DatabaseRegistry, target::TargetRegistry},
    api::AppState,
    auth::SessionStore,
    config::AppConfig,
    crypto::Crypto,
    executor::BackupExecutor,
    repository::Repository,
    scheduler::BackupScheduler,
};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "backup_manager=info,tower_http=info,axum=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = AppConfig::from_env();
    fs::create_dir_all(&config.data_dir).await?;
    fs::create_dir_all(&config.backups_dir).await?;

    let pool = SqlitePoolOptions::new()
        .max_connections(8)
        .connect(&config.database_url())
        .await
        .with_context(|| {
            format!(
                "failed to connect sqlite database at {}",
                config.database_path.display()
            )
        })?;
    sqlx::migrate!("./migrations").run(&pool).await?;

    let repository = Arc::new(Repository::new(pool));
    let database_registry = Arc::new(DatabaseRegistry::with_defaults());
    let target_registry = Arc::new(TargetRegistry::with_defaults());
    let crypto = Arc::new(Crypto::new(&config.app_secret)?);
    let executor = Arc::new(BackupExecutor::new(
        repository.clone(),
        database_registry.clone(),
        target_registry.clone(),
        crypto.clone(),
        config.backups_dir.clone(),
    ));
    let scheduler = Arc::new(BackupScheduler::new(repository.clone(), executor.clone()).await?);
    scheduler.reload().await?;

    let state = AppState {
        config: Arc::new(config.clone()),
        repository,
        database_registry,
        target_registry,
        crypto,
        sessions: Arc::new(SessionStore::default()),
        executor,
        scheduler,
    };

    let api = api::router(state);
    let web_dir = std::env::current_dir()?.join("web").join("dist");
    let app = Router::new()
        .nest("/api", api)
        .fallback_service(
            ServeDir::new(&web_dir)
                .append_index_html_on_directories(true)
                .fallback(ServeFile::new(web_dir.join("index.html"))),
        )
        .layer(TraceLayer::new_for_http());

    let addr: SocketAddr = config.bind_addr.parse()?;
    tracing::info!(%addr, "backup manager listening");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
