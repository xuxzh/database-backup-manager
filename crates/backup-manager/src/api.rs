use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{FromRef, Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post, put},
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    adapters::{database::DatabaseRegistry, target::TargetRegistry},
    auth::{Authenticated, SessionStore},
    config::AppConfig,
    crypto::Crypto,
    domain::*,
    executor::BackupExecutor,
    repository::Repository,
    scheduler::BackupScheduler,
};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<AppConfig>,
    pub repository: Arc<Repository>,
    pub database_registry: Arc<DatabaseRegistry>,
    pub target_registry: Arc<TargetRegistry>,
    pub crypto: Arc<Crypto>,
    pub sessions: Arc<SessionStore>,
    pub executor: Arc<BackupExecutor>,
    pub scheduler: Arc<BackupScheduler>,
}

impl FromRef<AppState> for Arc<SessionStore> {
    fn from_ref(input: &AppState) -> Self {
        input.sessions.clone()
    }
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/auth/login", post(login))
        .route("/schemas/databases", get(database_schemas))
        .route("/schemas/targets", get(target_schemas))
        .route("/dashboard", get(dashboard))
        .route("/sources", get(list_sources).post(create_source))
        .route("/sources/{id}/databases", get(list_source_databases))
        .route("/sources/{id}", put(update_source).delete(delete_source))
        .route("/sources/test", post(test_source))
        .route("/targets", get(list_targets).post(create_target))
        .route("/targets/{id}", put(update_target).delete(delete_target))
        .route("/targets/test", post(test_target))
        .route("/jobs", get(list_jobs).post(create_job))
        .route("/jobs/{id}", put(update_job).delete(delete_job))
        .route("/jobs/{id}/run", post(run_job))
        .route("/runs", get(list_runs))
        .route("/runs/{id}/logs", get(list_run_logs))
        .with_state(state)
}

async fn health() -> Json<serde_json::Value> {
    Json(json!({ "status": "ok" }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoginRequest {
    username: String,
    password: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LoginResponse {
    token: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TestSourceResponse {
    ok: bool,
    databases: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SourceDatabasesResponse {
    databases: Vec<String>,
}

async fn login(
    State(state): State<AppState>,
    Json(input): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, ApiError> {
    if input.username == state.config.admin_username
        && input.password == state.config.admin_password
    {
        Ok(Json(LoginResponse {
            token: state.sessions.create(),
        }))
    } else {
        Err(ApiError::unauthorized("用户名或密码错误"))
    }
}

async fn database_schemas(
    _auth: Authenticated,
    State(state): State<AppState>,
) -> Json<Vec<ConfigSchema>> {
    Json(state.database_registry.schemas())
}

async fn target_schemas(
    _auth: Authenticated,
    State(state): State<AppState>,
) -> Json<Vec<ConfigSchema>> {
    Json(state.target_registry.schemas())
}

async fn dashboard(
    _auth: Authenticated,
    State(state): State<AppState>,
) -> Result<Json<DashboardStats>, ApiError> {
    Ok(Json(state.repository.dashboard().await?))
}

async fn list_sources(
    _auth: Authenticated,
    State(state): State<AppState>,
) -> Result<Json<Vec<DatabaseConnection>>, ApiError> {
    Ok(Json(state.repository.list_database_connections().await?))
}

async fn create_source(
    _auth: Authenticated,
    State(state): State<AppState>,
    Json(input): Json<UpsertDatabaseConnection>,
) -> Result<Json<DatabaseConnection>, ApiError> {
    let encrypted = state.crypto.encrypt(&input.password)?;
    let encrypted_remote_secret = input
        .remote_secret
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(|value| state.crypto.encrypt(value))
        .transpose()?;
    Ok(Json(
        state
            .repository
            .create_database_connection(input, encrypted, encrypted_remote_secret)
            .await?,
    ))
}

async fn update_source(
    _auth: Authenticated,
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<UpsertDatabaseConnection>,
) -> Result<Json<DatabaseConnection>, ApiError> {
    let current = state
        .repository
        .get_database_connection(&id)
        .await
        .map_err(|_| ApiError::not_found("数据源不存在"))?;
    let encrypted = input
        .password
        .trim()
        .is_empty()
        .then_some(current.encrypted_password)
        .map(Ok)
        .unwrap_or_else(|| state.crypto.encrypt(&input.password))?;
    let encrypted_remote_secret = match input
        .remote_secret
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        Some(value) => Some(state.crypto.encrypt(value)?),
        None => current.encrypted_remote_secret,
    };
    Ok(Json(
        state
            .repository
            .update_database_connection(&id, input, encrypted, encrypted_remote_secret)
            .await?
            .ok_or_else(|| ApiError::not_found("数据源不存在"))?,
    ))
}

async fn test_source(
    _auth: Authenticated,
    State(state): State<AppState>,
    Json(input): Json<UpsertDatabaseConnection>,
) -> Result<Json<TestSourceResponse>, ApiError> {
    let input = input.normalized();
    let now = Utc::now();
    let source = DatabaseConnection {
        id: "__test__".to_string(),
        name: input.name,
        db_type: input.db_type,
        host: input.host,
        port: input.port,
        username: input.username,
        encrypted_password: String::new(),
        password: Some(input.password),
        database_name: input.database_name,
        execution_mode: input.execution_mode,
        remote_host: input.remote_host,
        remote_port: input.remote_port,
        remote_username: input.remote_username,
        remote_auth_method: input.remote_auth_method,
        encrypted_remote_secret: None,
        remote_secret: input.remote_secret,
        remote_tool_path: input.remote_tool_path,
        remote_working_dir: input.remote_working_dir,
        config_json: input.config_json,
        created_at: now,
        updated_at: now,
    };
    let adapter = state.database_registry.get(&source.db_type)?;
    adapter.test_connection(&source).await?;
    let databases = adapter.list_databases(&source).await?;
    Ok(Json(TestSourceResponse {
        ok: true,
        databases,
    }))
}

async fn list_source_databases(
    _auth: Authenticated,
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<SourceDatabasesResponse>, ApiError> {
    let databases = load_source_databases(&state, &id).await?;
    Ok(Json(SourceDatabasesResponse { databases }))
}

async fn load_source_databases(state: &AppState, id: &str) -> Result<Vec<String>, ApiError> {
    let mut source = state
        .repository
        .get_database_connection(id)
        .await
        .map_err(|_| ApiError::not_found("数据源不存在"))?;
    source.password = Some(state.crypto.decrypt(&source.encrypted_password)?);
    source.remote_secret = source
        .encrypted_remote_secret
        .as_deref()
        .map(|secret| state.crypto.decrypt(secret))
        .transpose()?;
    let adapter = state.database_registry.get(&source.db_type)?;
    Ok(adapter.list_databases(&source).await?)
}

async fn delete_source(
    _auth: Authenticated,
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    if state.repository.count_jobs_by_source(&id).await? > 0 {
        return Err(ApiError::conflict(
            "该数据源仍被备份任务引用，请先删除相关任务",
        ));
    }
    if state.repository.delete_database_connection(&id).await? {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::not_found("数据源不存在"))
    }
}

async fn list_targets(
    _auth: Authenticated,
    State(state): State<AppState>,
) -> Result<Json<Vec<BackupTarget>>, ApiError> {
    Ok(Json(state.repository.list_backup_targets().await?))
}

async fn create_target(
    _auth: Authenticated,
    State(state): State<AppState>,
    Json(input): Json<UpsertBackupTarget>,
) -> Result<Json<BackupTarget>, ApiError> {
    let encrypted = state.crypto.encrypt(&input.secret)?;
    Ok(Json(
        state
            .repository
            .create_backup_target(input, encrypted)
            .await?,
    ))
}

async fn update_target(
    _auth: Authenticated,
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<UpsertBackupTarget>,
) -> Result<Json<BackupTarget>, ApiError> {
    let current = state
        .repository
        .get_backup_target(&id)
        .await
        .map_err(|_| ApiError::not_found("备份目标不存在"))?;
    let encrypted = input
        .secret
        .trim()
        .is_empty()
        .then_some(current.encrypted_secret)
        .map(Ok)
        .unwrap_or_else(|| state.crypto.encrypt(&input.secret))?;
    Ok(Json(
        state
            .repository
            .update_backup_target(&id, input, encrypted)
            .await?
            .ok_or_else(|| ApiError::not_found("备份目标不存在"))?,
    ))
}

async fn test_target(
    _auth: Authenticated,
    State(state): State<AppState>,
    Json(input): Json<UpsertBackupTarget>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let input = input.normalized();
    let now = Utc::now();
    let target = BackupTarget {
        id: "__test__".to_string(),
        name: input.name,
        target_type: input.target_type,
        host: input.host,
        port: input.port,
        username: input.username,
        auth_method: input.auth_method,
        encrypted_secret: String::new(),
        secret: Some(input.secret),
        base_dir: input.base_dir,
        config_json: input.config_json,
        created_at: now,
        updated_at: now,
    };
    let adapter = state.target_registry.get(&target.target_type)?;
    adapter.test_connection(&target).await?;
    Ok(Json(json!({ "ok": true })))
}

async fn delete_target(
    _auth: Authenticated,
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    if state.repository.count_jobs_by_target(&id).await? > 0 {
        return Err(ApiError::conflict(
            "该备份目标仍被备份任务引用，请先删除相关任务",
        ));
    }
    if state.repository.delete_backup_target(&id).await? {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::not_found("备份目标不存在"))
    }
}

async fn list_jobs(
    _auth: Authenticated,
    State(state): State<AppState>,
) -> Result<Json<Vec<BackupJob>>, ApiError> {
    Ok(Json(state.repository.list_backup_jobs().await?))
}

async fn create_job(
    _auth: Authenticated,
    State(state): State<AppState>,
    Json(input): Json<UpsertBackupJob>,
) -> Result<Json<BackupJob>, ApiError> {
    let job = state.repository.create_backup_job(input).await?;
    state.scheduler.reload().await?;
    Ok(Json(job))
}

async fn update_job(
    _auth: Authenticated,
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<UpsertBackupJob>,
) -> Result<Json<BackupJob>, ApiError> {
    let job = state
        .repository
        .update_backup_job(&id, input)
        .await?
        .ok_or_else(|| ApiError::not_found("备份任务不存在"))?;
    state.scheduler.reload().await?;
    Ok(Json(job))
}

async fn delete_job(
    _auth: Authenticated,
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    if state.repository.delete_backup_job(&id).await? {
        state.scheduler.reload().await?;
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::not_found("备份任务不存在"))
    }
}

async fn run_job(
    _auth: Authenticated,
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<BackupRun>, ApiError> {
    state.repository.get_backup_job(&id).await?;
    Ok(Json(state.executor.enqueue(id).await?))
}

async fn list_runs(
    _auth: Authenticated,
    State(state): State<AppState>,
) -> Result<Json<Vec<BackupRun>>, ApiError> {
    Ok(Json(state.repository.list_runs().await?))
}

async fn list_run_logs(
    _auth: Authenticated,
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Vec<BackupRunLog>>, ApiError> {
    Ok(Json(state.repository.list_run_logs(&id).await?))
}

#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    code: &'static str,
    message: String,
}

impl ApiError {
    fn unauthorized(message: &str) -> Self {
        Self {
            status: StatusCode::UNAUTHORIZED,
            code: "UNAUTHORIZED",
            message: message.to_string(),
        }
    }

    fn not_found(message: &str) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            code: "NOT_FOUND",
            message: message.to_string(),
        }
    }

    fn conflict(message: &str) -> Self {
        Self {
            status: StatusCode::CONFLICT,
            code: "CONFLICT",
            message: message.to_string(),
        }
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(value: anyhow::Error) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code: "INTERNAL_ERROR",
            message: format!("{value:#}"),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(json!({
                "code": self.code,
                "message": self.message,
            })),
        )
            .into_response()
    }
}

#[cfg(test)]
mod tests {
    use std::{path::Path, sync::Arc};

    use anyhow::bail;
    use async_trait::async_trait;
    use sqlx::sqlite::SqlitePoolOptions;

    use super::*;
    use crate::{
        adapters::{
            database::{BackupCommand, DatabaseAdapter},
            target::TargetRegistry,
        },
        auth::SessionStore,
        config::AppConfig,
        crypto::Crypto,
        domain::{BackupJob, ConfigSchema, UpsertDatabaseConnection},
        executor::BackupExecutor,
    };

    struct SavedSourceListAdapter;

    #[async_trait]
    impl DatabaseAdapter for SavedSourceListAdapter {
        fn db_type(&self) -> &'static str {
            "saved-list-test"
        }

        fn display_name(&self) -> &'static str {
            "Saved List Test"
        }

        fn config_schema(&self) -> ConfigSchema {
            ConfigSchema {
                r#type: self.db_type().to_string(),
                display_name: self.display_name().to_string(),
                fields: vec![],
            }
        }

        fn validate_config(&self, _config: &DatabaseConnection) -> anyhow::Result<()> {
            Ok(())
        }

        async fn test_connection(&self, _config: &DatabaseConnection) -> anyhow::Result<()> {
            Ok(())
        }

        async fn list_databases(&self, config: &DatabaseConnection) -> anyhow::Result<Vec<String>> {
            if config.password.as_deref() != Some("plain-password") {
                bail!("password was not decrypted");
            }
            Ok(vec!["app".to_string(), "analytics".to_string()])
        }

        fn build_backup_command(
            &self,
            _config: &DatabaseConnection,
            _job: &BackupJob,
            _output_path: &Path,
        ) -> anyhow::Result<BackupCommand> {
            unreachable!("not used by this test")
        }

        fn build_restore_hint(&self, _archive_file: &str) -> String {
            String::new()
        }
    }

    #[tokio::test]
    async fn loads_databases_for_saved_source_with_decrypted_password() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();

        let repository = Arc::new(Repository::new(pool));
        let config = Arc::new(AppConfig::from_env());
        let crypto = Arc::new(Crypto::new(&config.app_secret).unwrap());
        let encrypted_password = crypto.encrypt("plain-password").unwrap();
        let source = repository
            .create_database_connection(
                UpsertDatabaseConnection {
                    name: "source".into(),
                    db_type: "saved-list-test".into(),
                    host: "127.0.0.1".into(),
                    port: 3306,
                    username: "backup".into(),
                    password: String::new(),
                    database_name: Some("app".into()),
                    execution_mode: "local".into(),
                    remote_host: None,
                    remote_port: None,
                    remote_username: None,
                    remote_auth_method: None,
                    remote_secret: None,
                    remote_tool_path: None,
                    remote_working_dir: None,
                    config_json: json!({}),
                },
                encrypted_password,
                None,
            )
            .await
            .unwrap();

        let mut database_registry = DatabaseRegistry::with_defaults();
        database_registry.register(Arc::new(SavedSourceListAdapter));
        let database_registry = Arc::new(database_registry);
        let target_registry = Arc::new(TargetRegistry::with_defaults());
        let executor = Arc::new(BackupExecutor::new(
            repository.clone(),
            database_registry.clone(),
            target_registry.clone(),
            crypto.clone(),
            std::env::temp_dir(),
        ));
        let scheduler = Arc::new(
            BackupScheduler::new(repository.clone(), executor.clone())
                .await
                .unwrap(),
        );
        let state = AppState {
            config,
            repository,
            database_registry,
            target_registry,
            crypto,
            sessions: Arc::new(SessionStore::default()),
            executor,
            scheduler,
        };

        let databases = load_source_databases(&state, &source.id).await.unwrap();

        assert_eq!(databases, vec!["app", "analytics"]);
    }
}
