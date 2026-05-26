use std::sync::Arc;

use axum::{
    Json, Router,
    body::Body,
    extract::{DefaultBodyLimit, FromRef, Multipart, Path, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use tokio::fs;
use uuid::Uuid;

use crate::{
    adapters::{database::DatabaseRegistry, target::TargetRegistry},
    auth::{Authenticated, SessionStore},
    config::AppConfig,
    crypto::Crypto,
    domain::*,
    executor::BackupExecutor,
    manual_upload::ManualUploadExecutor,
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
    pub manual_upload_executor: Arc<ManualUploadExecutor>,
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
        .route("/config/public", get(public_config))
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
        .route(
            "/manual-uploads",
            post(create_manual_upload).layer(DefaultBodyLimit::disable()),
        )
        .route("/runs", get(list_runs))
        .route("/runs/{id}/logs", get(list_run_logs))
        .route(
            "/runs/{id}/file",
            delete(delete_run_file).get(download_run_file),
        )
        .with_state(state)
}

async fn health() -> Json<serde_json::Value> {
    Json(json!({ "status": "ok" }))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PublicAppConfig {
    server: PublicServerConfig,
    defaults: PublicDefaultConfig,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PublicServerConfig {
    bind_addr: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PublicDefaultConfig {
    target_base_dir: String,
    ssh_port: i64,
}

impl From<&AppConfig> for PublicAppConfig {
    fn from(config: &AppConfig) -> Self {
        Self {
            server: PublicServerConfig {
                bind_addr: config.bind_addr.clone(),
            },
            defaults: PublicDefaultConfig {
                target_base_dir: config.default_target_base_dir.clone(),
                ssh_port: 22,
            },
        }
    }
}

async fn public_config(State(state): State<AppState>) -> Json<PublicAppConfig> {
    Json(PublicAppConfig::from(state.config.as_ref()))
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
        backup_mode: input.backup_mode,
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

async fn create_manual_upload(
    _auth: Authenticated,
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<BackupRun>, ApiError> {
    let mut backup_target_id = String::new();
    let mut source_id = String::new();
    let mut database_name = String::new();
    let mut note: Option<String> = None;
    let mut file_name: Option<String> = None;
    let mut file_bytes: Option<Vec<u8>> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|error| ApiError::bad_request(&format!("读取上传表单失败: {error}")))?
    {
        let name = field.name().unwrap_or_default().to_string();
        if name == "file" {
            file_name = field.file_name().map(|value| value.to_string());
            let bytes = field
                .bytes()
                .await
                .map_err(|error| ApiError::bad_request(&format!("读取上传文件失败: {error}")))?;
            file_bytes = Some(bytes.to_vec());
            continue;
        }

        let value = field
            .text()
            .await
            .map_err(|error| ApiError::bad_request(&format!("读取上传字段失败: {error}")))?;
        match name.as_str() {
            "backupTargetId" => backup_target_id = value.trim().to_string(),
            "sourceId" => source_id = value.trim().to_string(),
            "databaseName" => database_name = value.trim().to_string(),
            "note" => {
                note = if value.trim().is_empty() {
                    None
                } else {
                    Some(value.trim().to_string())
                }
            }
            _ => {}
        }
    }

    if backup_target_id.is_empty() {
        return Err(ApiError::bad_request("请选择备份目标"));
    }
    if source_id.is_empty() {
        return Err(ApiError::bad_request("请选择数据源"));
    }
    if database_name.is_empty() {
        return Err(ApiError::bad_request("请输入数据库名"));
    }

    state
        .repository
        .get_backup_target(&backup_target_id)
        .await
        .map_err(|_| ApiError::not_found("备份目标不存在"))?;
    let source = state
        .repository
        .get_database_connection(&source_id)
        .await
        .map_err(|_| ApiError::not_found("数据源不存在"))?;

    let run = state
        .manual_upload_executor
        .enqueue(
            CreateManualBackupUpload {
                database_connection_id: source.id,
                backup_target_id,
                source_label: source.name,
                database_type: source.db_type,
                database_name,
                original_file_name: file_name
                    .ok_or_else(|| ApiError::bad_request("请选择上传文件"))?,
                note,
            },
            file_bytes.ok_or_else(|| ApiError::bad_request("请选择上传文件"))?,
        )
        .await?;

    Ok(Json(run))
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

async fn download_run_file(
    _auth: Authenticated,
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Response, ApiError> {
    let (run, mut target, remote_path, archive_file_name) = run_file_context(&state, &id).await?;
    if run.file_deleted {
        return Err(ApiError::conflict("备份文件已删除"));
    }
    target.secret = Some(state.crypto.decrypt(&target.encrypted_secret)?);
    let adapter = state.target_registry.get(&target.target_type)?;
    let temp_path =
        std::env::temp_dir().join(format!("backup-manager-download-{}", Uuid::new_v4()));
    adapter
        .download(&target, &remote_path, &temp_path)
        .await
        .map_err(|error| ApiError::from(anyhow::anyhow!("下载远端备份文件失败: {error:#}")))?;
    let bytes = fs::read(&temp_path)
        .await
        .map_err(|error| ApiError::from(anyhow::anyhow!("读取下载临时文件失败: {error}")))?;
    let _ = fs::remove_file(&temp_path).await;
    if let Some(expected_checksum) = run.checksum.as_deref() {
        let actual_checksum = hex::encode(Sha256::digest(&bytes));
        if actual_checksum != expected_checksum {
            return Err(ApiError::conflict("下载文件 checksum 校验失败"));
        }
    }
    let disposition = format!(
        "attachment; filename=\"{}\"",
        archive_file_name.replace('"', "")
    );
    Ok((
        [
            (header::CONTENT_TYPE, "application/gzip".to_string()),
            (header::CONTENT_DISPOSITION, disposition),
        ],
        Body::from(bytes),
    )
        .into_response())
}

async fn delete_run_file(
    _auth: Authenticated,
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let (run, mut target, remote_path, _archive_file_name) = run_file_context(&state, &id).await?;
    if run.file_deleted {
        return Ok(StatusCode::NO_CONTENT);
    }
    target.secret = Some(state.crypto.decrypt(&target.encrypted_secret)?);
    let adapter = state.target_registry.get(&target.target_type)?;
    adapter
        .delete_file(&target, &remote_path)
        .await
        .map_err(|error| ApiError::from(anyhow::anyhow!("删除远端备份文件失败: {error:#}")))?;
    state.repository.mark_run_file_deleted(&id).await?;
    state
        .repository
        .add_run_log(&id, "INFO", "file_delete", "已删除远端备份文件")
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn run_file_context(
    state: &AppState,
    run_id: &str,
) -> Result<(BackupRun, BackupTarget, String, String), ApiError> {
    let run = state
        .repository
        .get_run(run_id)
        .await
        .map_err(|_| ApiError::not_found("运行记录不存在"))?;
    if run.status != RunStatus::Success {
        return Err(ApiError::conflict("只有成功的运行记录可以管理备份文件"));
    }
    let remote_path = run
        .remote_path
        .clone()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| ApiError::conflict("运行记录没有远端备份文件"))?;
    let archive_file_name = run
        .archive_file_name
        .clone()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| ApiError::conflict("运行记录没有归档文件名"))?;
    let target_id = if run.run_type == "manualUpload" {
        state
            .repository
            .get_manual_upload_by_run_id(&run.id)
            .await
            .map_err(|_| ApiError::not_found("手动上传记录不存在"))?
            .backup_target_id
    } else {
        scheduled_run_target_id(state, &run, &remote_path).await?
    };
    let target = state
        .repository
        .get_backup_target(&target_id)
        .await
        .map_err(|_| ApiError::not_found("备份目标不存在"))?;
    Ok((run, target, remote_path, archive_file_name))
}

async fn scheduled_run_target_id(
    state: &AppState,
    run: &BackupRun,
    remote_path: &str,
) -> Result<String, ApiError> {
    if !run.backup_job_id.trim().is_empty() {
        let job = state
            .repository
            .get_backup_job(&run.backup_job_id)
            .await
            .map_err(|_| ApiError::not_found("备份任务不存在"))?;
        return Ok(job.backup_target_id);
    }

    let targets = state.repository.list_backup_targets().await?;
    let matching_targets = targets
        .into_iter()
        .filter(|target| remote_path_is_under_base_dir(remote_path, &target.base_dir))
        .map(|target| target.id)
        .collect::<Vec<_>>();

    match matching_targets.as_slice() {
        [target_id] => Ok(target_id.clone()),
        [] => Err(ApiError::not_found(
            "备份任务不存在，且无法从远端路径匹配备份目标",
        )),
        _ => Err(ApiError::conflict("无法唯一确定运行记录对应的备份目标")),
    }
}

fn remote_path_is_under_base_dir(remote_path: &str, base_dir: &str) -> bool {
    let remote_path = remote_path.trim().trim_end_matches('/');
    let base_dir = base_dir.trim().trim_end_matches('/');
    if remote_path.is_empty() || base_dir.is_empty() {
        return false;
    }
    remote_path == base_dir
        || remote_path
            .strip_prefix(base_dir)
            .is_some_and(|suffix| suffix.starts_with('/'))
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

    fn bad_request(message: &str) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            code: "BAD_REQUEST",
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
        manual_upload::ManualUploadExecutor,
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
    async fn public_config_exposes_only_safe_runtime_defaults() {
        let config = AppConfig {
            bind_addr: "127.0.0.1:18080".into(),
            data_dir: "private-data".into(),
            backups_dir: "private-backups".into(),
            database_path: "private-data/backup-manager.db".into(),
            admin_username: "admin".into(),
            admin_password: "secret-password".into(),
            app_secret: "secret-key".into(),
            default_target_base_dir: "~/backups".into(),
            max_manual_upload_bytes: 1024 * 1024,
            manual_upload_allowed_extensions: vec!["gz".into(), "zip".into()],
        };

        let public_config = PublicAppConfig::from(&config);
        let value = serde_json::to_value(public_config).unwrap();

        assert_eq!(value["server"]["bindAddr"], "127.0.0.1:18080");
        assert_eq!(value["defaults"]["targetBaseDir"], "~/backups");
        assert_eq!(value["defaults"]["sshPort"], 22);
        assert!(value.get("adminPassword").is_none());
        assert!(value.get("appSecret").is_none());
        assert!(value.get("databasePath").is_none());
    }

    #[test]
    fn remote_path_matches_only_files_under_target_base_dir() {
        assert!(remote_path_is_under_base_dir(
            "/backups/job/run/app.sql.gz",
            "/backups"
        ));
        assert!(remote_path_is_under_base_dir(
            "~/backups/job/run/app.sql.gz",
            "~/backups/"
        ));
        assert!(!remote_path_is_under_base_dir(
            "/backups-other/job/run/app.sql.gz",
            "/backups"
        ));
        assert!(!remote_path_is_under_base_dir("", "/backups"));
        assert!(!remote_path_is_under_base_dir("/backups/app.sql.gz", ""));
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
                    backup_mode: "automatic".into(),
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
        let manual_upload_executor = Arc::new(ManualUploadExecutor::new(
            config.clone(),
            repository.clone(),
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
            manual_upload_executor,
            scheduler,
        };

        let databases = load_source_databases(&state, &source.id).await.unwrap();

        assert_eq!(databases, vec!["app", "analytics"]);
    }
}
