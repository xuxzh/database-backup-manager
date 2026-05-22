use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub bind_addr: String,
    pub data_dir: PathBuf,
    pub backups_dir: PathBuf,
    pub database_path: PathBuf,
    pub admin_username: String,
    pub admin_password: String,
    pub app_secret: String,
    pub default_target_base_dir: String,
}

impl AppConfig {
    pub fn from_env() -> Self {
        let data_dir = std::env::var("DATA_DIR").unwrap_or_else(|_| "data".to_string());
        let backups_dir = std::env::var("BACKUPS_DIR").unwrap_or_else(|_| "backups".to_string());
        let database_path = std::env::var("DATABASE_PATH")
            .unwrap_or_else(|_| format!("{data_dir}/backup-manager.db"));

        Self {
            bind_addr: std::env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".to_string()),
            data_dir: PathBuf::from(data_dir),
            backups_dir: PathBuf::from(backups_dir),
            database_path: PathBuf::from(database_path),
            admin_username: std::env::var("ADMIN_USERNAME").unwrap_or_else(|_| "admin".to_string()),
            admin_password: std::env::var("ADMIN_PASSWORD")
                .unwrap_or_else(|_| "admin123".to_string()),
            app_secret: std::env::var("APP_SECRET")
                .unwrap_or_else(|_| "dev-secret-change-me".to_string()),
            default_target_base_dir: std::env::var("DEFAULT_TARGET_BASE_DIR")
                .unwrap_or_else(|_| "~/backups".to_string()),
        }
    }

    pub fn database_url(&self) -> String {
        format!("sqlite://{}?mode=rwc", self.database_path.display())
    }
}
