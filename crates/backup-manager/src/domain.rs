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
        self
    }
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
    pub error_message: Option<String>,
    pub created_at: DateTime<Utc>,
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
