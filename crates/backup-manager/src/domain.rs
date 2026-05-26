use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigField {
    pub name: String,
    pub label: String,
    pub field_type: String,
    pub required: bool,
    pub default: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigSchema {
    pub r#type: String,
    pub display_name: String,
    pub fields: Vec<ConfigField>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseConnection {
    pub id: String,
    pub name: String,
    pub db_type: String,
    pub host: String,
    pub port: i64,
    pub username: String,
    #[serde(skip_serializing)]
    pub encrypted_password: String,
    pub password: Option<String>,
    pub database_name: Option<String>,
    pub backup_mode: String,
    pub execution_mode: String,
    pub remote_host: Option<String>,
    pub remote_port: Option<i64>,
    pub remote_username: Option<String>,
    pub remote_auth_method: Option<String>,
    #[serde(skip_serializing)]
    pub encrypted_remote_secret: Option<String>,
    pub remote_secret: Option<String>,
    pub remote_tool_path: Option<String>,
    pub remote_working_dir: Option<String>,
    pub config_json: Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertDatabaseConnection {
    pub name: String,
    pub db_type: String,
    pub host: String,
    pub port: i64,
    pub username: String,
    pub password: String,
    pub database_name: Option<String>,
    #[serde(default = "default_backup_mode")]
    pub backup_mode: String,
    #[serde(default = "default_execution_mode")]
    pub execution_mode: String,
    pub remote_host: Option<String>,
    pub remote_port: Option<i64>,
    pub remote_username: Option<String>,
    pub remote_auth_method: Option<String>,
    pub remote_secret: Option<String>,
    pub remote_tool_path: Option<String>,
    pub remote_working_dir: Option<String>,
    #[serde(default)]
    pub config_json: Value,
}

impl UpsertDatabaseConnection {
    pub fn normalized(mut self) -> Self {
        self.name = self.name.trim().to_string();
        self.db_type = self.db_type.trim().to_string();
        self.host = self.host.trim().to_string();
        self.username = self.username.trim().to_string();
        self.database_name = self
            .database_name
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        self.execution_mode = normalize_execution_mode(&self.execution_mode);
        self.backup_mode = normalize_backup_mode(&self.backup_mode);
        if self.backup_mode == "manual" {
            self.username = String::new();
            self.password = String::new();
            self.execution_mode = "local".to_string();
            self.remote_host = None;
            self.remote_port = None;
            self.remote_username = None;
            self.remote_auth_method = None;
            self.remote_secret = None;
            self.remote_tool_path = None;
            self.remote_working_dir = None;
        }
        self.remote_host = normalize_optional_string(self.remote_host);
        self.remote_username = normalize_optional_string(self.remote_username);
        self.remote_auth_method = self
            .remote_auth_method
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        self.remote_secret = normalize_optional_string(self.remote_secret);
        self.remote_tool_path = normalize_optional_string(self.remote_tool_path);
        self.remote_working_dir = normalize_optional_string(self.remote_working_dir);
        self
    }
}

fn default_execution_mode() -> String {
    "local".to_string()
}

fn default_backup_mode() -> String {
    "automatic".to_string()
}

fn normalize_backup_mode(value: &str) -> String {
    match value.trim() {
        "manual" => "manual".to_string(),
        _ => "automatic".to_string(),
    }
}

fn normalize_execution_mode(value: &str) -> String {
    match value.trim() {
        "remoteSsh" => "remoteSsh".to_string(),
        _ => "local".to_string(),
    }
}

fn normalize_optional_string(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupTarget {
    pub id: String,
    pub name: String,
    pub target_type: String,
    pub host: String,
    pub port: i64,
    pub username: String,
    pub auth_method: String,
    #[serde(skip_serializing)]
    pub encrypted_secret: String,
    pub secret: Option<String>,
    pub base_dir: String,
    pub config_json: Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertBackupTarget {
    pub name: String,
    pub target_type: String,
    pub host: String,
    pub port: i64,
    pub username: String,
    pub auth_method: String,
    pub secret: String,
    pub base_dir: String,
    #[serde(default)]
    pub config_json: Value,
}

impl UpsertBackupTarget {
    pub fn normalized(mut self) -> Self {
        self.name = self.name.trim().to_string();
        self.target_type = self.target_type.trim().to_string();
        self.host = self.host.trim().to_string();
        self.username = self.username.trim().to_string();
        self.auth_method = self.auth_method.trim().to_string();
        self.base_dir = self.base_dir.trim().to_string();
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupJob {
    pub id: String,
    pub name: String,
    pub database_connection_id: String,
    pub database_name: String,
    pub backup_target_id: String,
    pub schedule: String,
    pub compression: String,
    pub remote_retention_days: i64,
    pub local_retention_days: i64,
    pub enabled: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertBackupJob {
    pub name: String,
    pub database_connection_id: String,
    pub database_name: String,
    pub backup_target_id: String,
    pub schedule: String,
    pub compression: String,
    pub remote_retention_days: i64,
    pub local_retention_days: i64,
    pub enabled: bool,
}

impl UpsertBackupJob {
    pub fn normalized(mut self) -> Self {
        self.name = self.name.trim().to_string();
        self.database_connection_id = self.database_connection_id.trim().to_string();
        self.database_name = self.database_name.trim().to_string();
        self.backup_target_id = self.backup_target_id.trim().to_string();
        self.schedule = self.schedule.trim().to_string();
        self.compression = self.compression.trim().to_string();
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum RunStatus {
    Pending,
    Running,
    Success,
    Failed,
}

impl std::fmt::Display for RunStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{self:?}")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupRun {
    pub id: String,
    pub backup_job_id: String,
    pub run_type: String,
    pub job_name: Option<String>,
    pub source_name: Option<String>,
    pub source_type: Option<String>,
    pub source_endpoint: Option<String>,
    pub database_name: Option<String>,
    pub target_name: Option<String>,
    pub target_type: Option<String>,
    pub target_base_dir: Option<String>,
    pub status: RunStatus,
    pub stage: String,
    pub started_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
    pub duration_ms: Option<i64>,
    pub raw_file_name: Option<String>,
    pub archive_file_name: Option<String>,
    pub file_size: Option<i64>,
    pub checksum: Option<String>,
    pub remote_path: Option<String>,
    pub file_deleted: bool,
    pub file_deleted_at: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualBackupUpload {
    pub id: String,
    pub backup_run_id: String,
    pub database_connection_id: String,
    pub backup_target_id: String,
    pub source_label: String,
    pub database_type: String,
    pub database_name: String,
    pub original_file_name: String,
    pub note: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct CreateManualBackupUpload {
    pub database_connection_id: String,
    pub backup_target_id: String,
    pub source_label: String,
    pub database_type: String,
    pub database_name: String,
    pub original_file_name: String,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupRunLog {
    pub id: String,
    pub backup_run_id: String,
    pub timestamp: DateTime<Utc>,
    pub level: String,
    pub stage: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardStats {
    pub source_count: i64,
    pub target_count: i64,
    pub job_count: i64,
    pub enabled_job_count: i64,
    pub today_success_count: i64,
    pub today_failed_count: i64,
    pub latest_run: Option<BackupRun>,
}
