use std::{collections::HashMap, path::Path, sync::Arc};

use anyhow::{anyhow, bail};
use async_trait::async_trait;
use serde_json::json;
use tokio::process::Command;

use crate::domain::{BackupJob, ConfigField, ConfigSchema, DatabaseConnection};

#[derive(Debug, Clone)]
pub struct BackupCommand {
    pub program: String,
    pub args: Vec<String>,
}

#[async_trait]
pub trait DatabaseAdapter: Send + Sync {
    fn db_type(&self) -> &'static str;
    fn display_name(&self) -> &'static str;
    fn config_schema(&self) -> ConfigSchema;
    fn validate_config(&self, config: &DatabaseConnection) -> anyhow::Result<()>;
    async fn test_connection(&self, config: &DatabaseConnection) -> anyhow::Result<()>;
    fn build_backup_command(
        &self,
        config: &DatabaseConnection,
        job: &BackupJob,
        output_path: &Path,
    ) -> anyhow::Result<BackupCommand>;
    fn build_restore_hint(&self, archive_file: &str) -> String;
}

#[derive(Clone)]
pub struct DatabaseRegistry {
    adapters: HashMap<String, Arc<dyn DatabaseAdapter>>,
}

impl DatabaseRegistry {
    pub fn with_defaults() -> Self {
        let mut registry = Self {
            adapters: HashMap::new(),
        };
        registry.register(Arc::new(MySqlAdapter));
        registry.register(Arc::new(PostgresAdapter));
        registry
    }

    pub fn register(&mut self, adapter: Arc<dyn DatabaseAdapter>) {
        self.adapters.insert(adapter.db_type().to_string(), adapter);
    }

    pub fn get(&self, db_type: &str) -> anyhow::Result<Arc<dyn DatabaseAdapter>> {
        self.adapters
            .get(db_type)
            .cloned()
            .ok_or_else(|| anyhow!("unsupported database type: {db_type}"))
    }

    pub fn schemas(&self) -> Vec<ConfigSchema> {
        let mut schemas = self
            .adapters
            .values()
            .map(|adapter| adapter.config_schema())
            .collect::<Vec<_>>();
        schemas.sort_by(|a, b| a.r#type.cmp(&b.r#type));
        schemas
    }
}

pub struct MySqlAdapter;

#[async_trait]
impl DatabaseAdapter for MySqlAdapter {
    fn db_type(&self) -> &'static str {
        "mysql"
    }

    fn display_name(&self) -> &'static str {
        "MySQL"
    }

    fn config_schema(&self) -> ConfigSchema {
        ConfigSchema {
            r#type: "mysql".to_string(),
            display_name: self.display_name().to_string(),
            fields: common_fields(3306),
        }
    }

    fn validate_config(&self, config: &DatabaseConnection) -> anyhow::Result<()> {
        require_connection(config)
    }

    async fn test_connection(&self, config: &DatabaseConnection) -> anyhow::Result<()> {
        self.validate_config(config)?;
        let password = config.password.as_deref().unwrap_or_default();
        let port = config.port.to_string();
        let status = Command::new(tool_program("MYSQLADMIN_PATH", "mysqladmin"))
            .env("MYSQL_PWD", password)
            .args([
                "-h",
                config.host.trim(),
                "-P",
                port.as_str(),
                "-u",
                config.username.trim(),
                "ping",
            ])
            .status()
            .await?;
        if status.success() {
            Ok(())
        } else {
            bail!("mysqladmin ping failed with status {status}");
        }
    }

    fn build_backup_command(
        &self,
        config: &DatabaseConnection,
        job: &BackupJob,
        output_path: &Path,
    ) -> anyhow::Result<BackupCommand> {
        self.validate_config(config)?;
        Ok(BackupCommand {
            program: tool_program("MYSQLDUMP_PATH", "mysqldump"),
            args: vec![
                format!("--host={}", config.host.trim()),
                format!("--port={}", config.port),
                format!("--user={}", config.username.trim()),
                "--single-transaction".to_string(),
                "--routines".to_string(),
                "--triggers".to_string(),
                "--events".to_string(),
                "--result-file".to_string(),
                output_path.display().to_string(),
                job.database_name.clone(),
            ],
        })
    }

    fn build_restore_hint(&self, archive_file: &str) -> String {
        format!("gunzip -c {archive_file} | mysql -h <host> -u <user> -p <database>")
    }
}

pub struct PostgresAdapter;

#[async_trait]
impl DatabaseAdapter for PostgresAdapter {
    fn db_type(&self) -> &'static str {
        "postgres"
    }

    fn display_name(&self) -> &'static str {
        "PostgreSQL"
    }

    fn config_schema(&self) -> ConfigSchema {
        let mut fields = common_fields(5432);
        fields.push(ConfigField {
            name: "sslmode".to_string(),
            label: "SSL 模式".to_string(),
            field_type: "text".to_string(),
            required: false,
            default: Some(json!("prefer")),
        });
        ConfigSchema {
            r#type: "postgres".to_string(),
            display_name: self.display_name().to_string(),
            fields,
        }
    }

    fn validate_config(&self, config: &DatabaseConnection) -> anyhow::Result<()> {
        require_connection(config)
    }

    async fn test_connection(&self, config: &DatabaseConnection) -> anyhow::Result<()> {
        self.validate_config(config)?;
        let password = config.password.as_deref().unwrap_or_default();
        let database = config
            .database_name
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("postgres");
        let port = config.port.to_string();
        let status = Command::new(tool_program("PG_ISREADY_PATH", "pg_isready"))
            .env("PGPASSWORD", password)
            .args([
                "-h",
                config.host.trim(),
                "-p",
                port.as_str(),
                "-U",
                config.username.trim(),
                "-d",
                database,
            ])
            .status()
            .await?;
        if status.success() {
            Ok(())
        } else {
            bail!("pg_isready failed with status {status}");
        }
    }

    fn build_backup_command(
        &self,
        config: &DatabaseConnection,
        job: &BackupJob,
        output_path: &Path,
    ) -> anyhow::Result<BackupCommand> {
        self.validate_config(config)?;
        Ok(BackupCommand {
            program: tool_program("PG_DUMP_PATH", "pg_dump"),
            args: vec![
                format!("--host={}", config.host.trim()),
                format!("--port={}", config.port),
                format!("--username={}", config.username.trim()),
                format!("--dbname={}", job.database_name.trim()),
                "--format=custom".to_string(),
                format!("--file={}", output_path.display()),
                format!("--no-password"),
            ],
        })
    }

    fn build_restore_hint(&self, archive_file: &str) -> String {
        format!("gunzip -c {archive_file} > backup.dump && pg_restore -d <database> backup.dump")
    }
}

fn common_fields(default_port: i64) -> Vec<ConfigField> {
    vec![
        ConfigField {
            name: "host".to_string(),
            label: "主机".to_string(),
            field_type: "text".to_string(),
            required: true,
            default: None,
        },
        ConfigField {
            name: "port".to_string(),
            label: "端口".to_string(),
            field_type: "number".to_string(),
            required: true,
            default: Some(json!(default_port)),
        },
        ConfigField {
            name: "username".to_string(),
            label: "用户名".to_string(),
            field_type: "text".to_string(),
            required: true,
            default: None,
        },
        ConfigField {
            name: "password".to_string(),
            label: "密码".to_string(),
            field_type: "password".to_string(),
            required: true,
            default: None,
        },
        ConfigField {
            name: "databaseName".to_string(),
            label: "默认数据库".to_string(),
            field_type: "text".to_string(),
            required: false,
            default: None,
        },
    ]
}

fn require_connection(config: &DatabaseConnection) -> anyhow::Result<()> {
    if config.host.trim().is_empty() {
        bail!("host is required");
    }
    if config.username.trim().is_empty() {
        bail!("username is required");
    }
    if config.port <= 0 {
        bail!("port must be positive");
    }
    Ok(())
}

fn tool_program(env_name: &str, default_program: &str) -> String {
    std::env::var(env_name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| default_program.to_string())
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use serde_json::json;

    use super::{DatabaseAdapter, MySqlAdapter, PostgresAdapter};
    use crate::domain::{BackupJob, DatabaseConnection};

    fn connection(db_type: &str) -> DatabaseConnection {
        DatabaseConnection {
            id: "source".into(),
            name: "source".into(),
            db_type: db_type.into(),
            host: "127.0.0.1".into(),
            port: if db_type == "mysql" { 3306 } else { 5432 },
            username: "backup".into(),
            encrypted_password: "secret".into(),
            password: Some("secret".into()),
            database_name: Some("app".into()),
            config_json: json!({}),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    fn job() -> BackupJob {
        let now = Utc::now();
        BackupJob {
            id: "job".into(),
            name: "daily".into(),
            database_connection_id: "source".into(),
            database_name: "app".into(),
            backup_target_id: "target".into(),
            schedule: "0 0 2 * * *".into(),
            compression: "gzip".into(),
            remote_retention_days: 7,
            local_retention_days: 1,
            enabled: true,
            created_at: now,
            updated_at: now,
        }
    }

    #[test]
    fn mysql_command_uses_argument_array() {
        let command = MySqlAdapter
            .build_backup_command(
                &connection("mysql"),
                &job(),
                std::path::Path::new("/tmp/app.sql"),
            )
            .unwrap();
        assert_eq!(command.program, "mysqldump");
        assert!(command.args.contains(&"--single-transaction".to_string()));
        assert!(command.args.contains(&"--result-file".to_string()));
    }

    #[test]
    fn postgres_command_uses_custom_format() {
        let command = PostgresAdapter
            .build_backup_command(
                &connection("postgres"),
                &job(),
                std::path::Path::new("/tmp/app.dump"),
            )
            .unwrap();
        assert_eq!(command.program, "pg_dump");
        assert!(command.args.contains(&"--format=custom".to_string()));
    }

    #[test]
    fn mysql_command_trims_connection_fields() {
        let mut connection = connection("mysql");
        connection.host = " 192.168.0.135 ".into();
        connection.username = " backup ".into();

        let command = MySqlAdapter
            .build_backup_command(&connection, &job(), std::path::Path::new("/tmp/app.sql"))
            .unwrap();

        assert!(command.args.contains(&"--host=192.168.0.135".to_string()));
        assert!(command.args.contains(&"--user=backup".to_string()));
    }
}
