use std::{
    collections::HashMap,
    io::ErrorKind,
    path::{Path, PathBuf},
    sync::Arc,
};

use anyhow::{anyhow, bail};
use async_trait::async_trait;
use serde_json::json;
use tokio::{fs, process::Command};

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
    async fn list_databases(&self, config: &DatabaseConnection) -> anyhow::Result<Vec<String>>;
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
        registry.register(Arc::new(MssqlAdapter));
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
        if config.execution_mode == "remoteSsh" {
            return run_remote_test(config, build_remote_mysql_test_command(config)).await;
        }
        let password = config.password.as_deref().unwrap_or_default();
        let port = config.port.to_string();
        let output = Command::new(tool_program("MYSQLADMIN_PATH", "mysqladmin"))
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
            .output()
            .await
            .map_err(command_error("mysqladmin", "MYSQLADMIN_PATH"))?;
        if output.status.success() {
            Ok(())
        } else {
            bail!("mysqladmin ping failed: {}", command_stderr(&output.stderr));
        }
    }

    async fn list_databases(&self, config: &DatabaseConnection) -> anyhow::Result<Vec<String>> {
        self.validate_config(config)?;
        if config.execution_mode == "remoteSsh" {
            let output =
                run_remote_database_list(config, build_remote_mysql_database_list_command(config))
                    .await?;
            return Ok(parse_database_names(&output));
        }
        let password = config.password.as_deref().unwrap_or_default();
        let port = config.port.to_string();
        let output = Command::new(tool_program("MYSQL_PATH", "mysql"))
            .env("MYSQL_PWD", password)
            .args([
                "--batch",
                "--skip-column-names",
                "-h",
                config.host.trim(),
                "-P",
                port.as_str(),
                "-u",
                config.username.trim(),
                "-e",
                "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA ORDER BY SCHEMA_NAME",
            ])
            .output()
            .await
            .map_err(command_error("mysql", "MYSQL_PATH"))?;
        if output.status.success() {
            Ok(parse_database_names(&output.stdout))
        } else {
            bail!(
                "mysql database list failed: {}",
                command_stderr(&output.stderr)
            );
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
        if config.execution_mode == "remoteSsh" {
            return run_remote_test(config, build_remote_postgres_test_command(config)).await;
        }
        let password = config.password.as_deref().unwrap_or_default();
        let database = config
            .database_name
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("postgres");
        let port = config.port.to_string();
        let output = Command::new(tool_program("PSQL_PATH", "psql"))
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
                "-w",
                "-c",
                "SELECT 1",
            ])
            .output()
            .await
            .map_err(command_error("psql", "PSQL_PATH"))?;
        if output.status.success() {
            Ok(())
        } else {
            bail!(
                "psql connection test failed: {}",
                command_stderr(&output.stderr)
            );
        }
    }

    async fn list_databases(&self, config: &DatabaseConnection) -> anyhow::Result<Vec<String>> {
        self.validate_config(config)?;
        if config.execution_mode == "remoteSsh" {
            let output = run_remote_database_list(
                config,
                build_remote_postgres_database_list_command(config),
            )
            .await?;
            return Ok(parse_database_names(&output));
        }
        let password = config.password.as_deref().unwrap_or_default();
        let port = config.port.to_string();
        let output = Command::new(tool_program("PSQL_PATH", "psql"))
            .env("PGPASSWORD", password)
            .args([
                "-h",
                config.host.trim(),
                "-p",
                port.as_str(),
                "-U",
                config.username.trim(),
                "-d",
                "postgres",
                "-w",
                "-At",
                "-c",
                "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname",
            ])
            .output()
            .await
            .map_err(command_error("psql", "PSQL_PATH"))?;
        if output.status.success() {
            Ok(parse_database_names(&output.stdout))
        } else {
            bail!(
                "postgres database list failed: {}",
                command_stderr(&output.stderr)
            );
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

pub struct MssqlAdapter;

#[async_trait]
impl DatabaseAdapter for MssqlAdapter {
    fn db_type(&self) -> &'static str {
        "mssql"
    }

    fn display_name(&self) -> &'static str {
        "SQL Server"
    }

    fn config_schema(&self) -> ConfigSchema {
        ConfigSchema {
            r#type: "mssql".to_string(),
            display_name: self.display_name().to_string(),
            fields: common_fields(1433),
        }
    }

    fn validate_config(&self, config: &DatabaseConnection) -> anyhow::Result<()> {
        require_connection(config)
    }

    async fn test_connection(&self, config: &DatabaseConnection) -> anyhow::Result<()> {
        self.validate_config(config)?;
        if config.execution_mode == "remoteSsh" {
            return run_remote_test(config, build_remote_mssql_test_command(config)).await;
        }
        let server = mssql_server_name(config);
        let output = Command::new(tool_program("SQLCMD_PATH", "sqlcmd"))
            .args([
                "-S",
                server.as_str(),
                "-U",
                config.username.trim(),
                "-P",
                config.password.as_deref().unwrap_or_default(),
                "-Q",
                "SELECT 1",
                "-C",
                "-b",
            ])
            .output()
            .await
            .map_err(command_error("sqlcmd", "SQLCMD_PATH"))?;
        if output.status.success() {
            Ok(())
        } else {
            bail!(
                "sqlcmd connection test failed: {}",
                command_stderr(&output.stderr)
            );
        }
    }

    async fn list_databases(&self, config: &DatabaseConnection) -> anyhow::Result<Vec<String>> {
        self.validate_config(config)?;
        if config.execution_mode == "remoteSsh" {
            let output =
                run_remote_database_list(config, build_remote_mssql_database_list_command(config))
                    .await?;
            return Ok(parse_database_names(&output));
        }
        let server = mssql_server_name(config);
        let output = Command::new(tool_program("SQLCMD_PATH", "sqlcmd"))
            .args([
                "-S",
                server.as_str(),
                "-U",
                config.username.trim(),
                "-P",
                config.password.as_deref().unwrap_or_default(),
                "-Q",
                "SET NOCOUNT ON; SELECT name FROM sys.databases WHERE database_id > 4 ORDER BY name",
                "-h",
                "-1",
                "-W",
                "-C",
                "-b",
            ])
            .output()
            .await
            .map_err(command_error("sqlcmd", "SQLCMD_PATH"))?;
        if output.status.success() {
            Ok(parse_database_names(&output.stdout))
        } else {
            bail!(
                "sqlcmd database list failed: {}",
                command_stderr(&output.stderr)
            );
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
            program: tool_program("SQLPACKAGE_PATH", "sqlpackage"),
            args: vec![
                "/Action:Export".to_string(),
                format!("/SourceServerName:{}", mssql_server_name(config)),
                format!("/SourceDatabaseName:{}", job.database_name.trim()),
                format!("/SourceUser:{}", config.username.trim()),
                format!(
                    "/SourcePassword:{}",
                    config.password.as_deref().unwrap_or_default()
                ),
                "/SourceTrustServerCertificate:True".to_string(),
                format!("/TargetFile:{}", output_path.display()),
            ],
        })
    }

    fn build_restore_hint(&self, archive_file: &str) -> String {
        format!(
            "gunzip -c {archive_file} > backup.bacpac && sqlpackage /Action:Import /SourceFile:backup.bacpac /TargetServerName:<host>,<port> /TargetDatabaseName:<database> /TargetUser:<user> /TargetPassword:<password>"
        )
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

fn command_error(
    program: &'static str,
    env_name: &'static str,
) -> impl Fn(std::io::Error) -> anyhow::Error {
    move |error| {
        if error.kind() == ErrorKind::NotFound {
            anyhow!(
                "未找到数据库连接测试工具 `{program}`。请在运行环境安装对应数据库客户端，或通过 {env_name} 指定可执行文件绝对路径: {error}"
            )
        } else {
            anyhow!("failed to run {program}: {error}")
        }
    }
}

fn command_stderr(stderr: &[u8]) -> String {
    let message = String::from_utf8_lossy(stderr).trim().to_string();
    if message.is_empty() {
        "no error output".to_string()
    } else {
        message
    }
}

fn parse_database_names(output: &[u8]) -> Vec<String> {
    String::from_utf8_lossy(output)
        .lines()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn mssql_server_name(config: &DatabaseConnection) -> String {
    format!("{},{}", config.host.trim(), config.port)
}

async fn run_remote_test(
    config: &DatabaseConnection,
    remote_command: String,
) -> anyhow::Result<()> {
    let auth_method = config.remote_auth_method.as_deref().unwrap_or("key");
    let identity_file = if auth_method == "key" {
        Some(write_remote_identity_file(config).await?)
    } else {
        None
    };
    let mut command = remote_ssh_command(config, identity_file.as_deref())?;
    command.arg(remote_command);
    let output = command.output().await;
    if let Some(path) = identity_file {
        let _ = fs::remove_file(path).await;
    }
    let output = output.map_err(command_error("ssh/sshpass", "PATH"))?;
    if output.status.success() {
        Ok(())
    } else {
        bail!(
            "remote database connection test failed: {}",
            command_stderr(&output.stderr)
        );
    }
}

async fn run_remote_database_list(
    config: &DatabaseConnection,
    remote_command: String,
) -> anyhow::Result<Vec<u8>> {
    let auth_method = config.remote_auth_method.as_deref().unwrap_or("key");
    let identity_file = if auth_method == "key" {
        Some(write_remote_identity_file(config).await?)
    } else {
        None
    };
    let mut command = remote_ssh_command(config, identity_file.as_deref())?;
    command.arg(remote_command);
    let output = command.output().await;
    if let Some(path) = identity_file {
        let _ = fs::remove_file(path).await;
    }
    let output = output.map_err(command_error("ssh/sshpass", "PATH"))?;
    if output.status.success() {
        Ok(output.stdout)
    } else {
        bail!(
            "remote database list failed: {}",
            command_stderr(&output.stderr)
        );
    }
}

fn build_remote_mysql_test_command(config: &DatabaseConnection) -> String {
    format!(
        "MYSQL_PWD={} mysqladmin -h {} -P {} -u {} ping",
        shell_quote(config.password.as_deref().unwrap_or_default()),
        shell_quote(config.host.trim()),
        config.port,
        shell_quote(config.username.trim())
    )
}

fn build_remote_mysql_database_list_command(config: &DatabaseConnection) -> String {
    format!(
        "MYSQL_PWD={} mysql --batch --skip-column-names -h {} -P {} -u {} -e {}",
        shell_quote(config.password.as_deref().unwrap_or_default()),
        shell_quote(config.host.trim()),
        config.port,
        shell_quote(config.username.trim()),
        shell_quote("SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA ORDER BY SCHEMA_NAME")
    )
}

fn build_remote_postgres_test_command(config: &DatabaseConnection) -> String {
    let database = config
        .database_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("postgres");
    format!(
        "PGPASSWORD={} psql -h {} -p {} -U {} -d {} -w -c 'SELECT 1'",
        shell_quote(config.password.as_deref().unwrap_or_default()),
        shell_quote(config.host.trim()),
        config.port,
        shell_quote(config.username.trim()),
        shell_quote(database)
    )
}

fn build_remote_postgres_database_list_command(config: &DatabaseConnection) -> String {
    format!(
        "PGPASSWORD={} psql -h {} -p {} -U {} -d postgres -w -At -c {}",
        shell_quote(config.password.as_deref().unwrap_or_default()),
        shell_quote(config.host.trim()),
        config.port,
        shell_quote(config.username.trim()),
        shell_quote("SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname")
    )
}

fn build_remote_mssql_test_command(config: &DatabaseConnection) -> String {
    format!(
        "sqlcmd -S {} -U {} -P {} -Q 'SELECT 1' -C -b",
        shell_quote(&mssql_server_name(config)),
        shell_quote(config.username.trim()),
        shell_quote(config.password.as_deref().unwrap_or_default())
    )
}

fn build_remote_mssql_database_list_command(config: &DatabaseConnection) -> String {
    format!(
        "sqlcmd -S {} -U {} -P {} -Q {} -h -1 -W -C -b",
        shell_quote(&mssql_server_name(config)),
        shell_quote(config.username.trim()),
        shell_quote(config.password.as_deref().unwrap_or_default()),
        shell_quote(
            "SET NOCOUNT ON; SELECT name FROM sys.databases WHERE database_id > 4 ORDER BY name"
        )
    )
}

fn remote_ssh_command(
    config: &DatabaseConnection,
    identity_file: Option<&Path>,
) -> anyhow::Result<Command> {
    match config.remote_auth_method.as_deref().unwrap_or("key") {
        "password" => {
            let password = required_remote_field(config.remote_secret.as_deref(), "remoteSecret")?;
            let mut command = Command::new("sshpass");
            command.arg("-e").arg("ssh").env("SSHPASS", password);
            command.args(remote_ssh_options(config, identity_file)?);
            Ok(command)
        }
        "key" => {
            let mut command = Command::new("ssh");
            command.args(remote_ssh_options(config, identity_file)?);
            Ok(command)
        }
        other => bail!("unsupported remote ssh auth method: {other}"),
    }
}

fn remote_ssh_options(
    config: &DatabaseConnection,
    identity_file: Option<&Path>,
) -> anyhow::Result<Vec<String>> {
    let remote_host = required_remote_field(config.remote_host.as_deref(), "remoteHost")?;
    let remote_username =
        required_remote_field(config.remote_username.as_deref(), "remoteUsername")?;
    let remote_port = config.remote_port.unwrap_or(22).to_string();
    let mut args = vec![
        "-o".to_string(),
        "BatchMode=no".to_string(),
        "-o".to_string(),
        "StrictHostKeyChecking=accept-new".to_string(),
        "-p".to_string(),
        remote_port,
    ];
    if config.remote_auth_method.as_deref().unwrap_or("key") == "key" {
        let identity_file =
            identity_file.ok_or_else(|| anyhow!("missing remote ssh identity file"))?;
        args.push("-i".to_string());
        args.push(identity_file.display().to_string());
    }
    args.push(format!("{remote_username}@{remote_host}"));
    Ok(args)
}

async fn write_remote_identity_file(config: &DatabaseConnection) -> anyhow::Result<PathBuf> {
    let secret = required_remote_field(config.remote_secret.as_deref(), "remoteSecret")?;
    let path = std::env::temp_dir().join(format!(
        ".backup-manager-source-test-ssh-key-{}",
        uuid::Uuid::new_v4()
    ));
    fs::write(&path, secret).await?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = fs::metadata(&path).await?.permissions();
        permissions.set_mode(0o600);
        fs::set_permissions(&path, permissions).await?;
    }
    Ok(path)
}

fn required_remote_field<'a>(value: Option<&'a str>, field: &str) -> anyhow::Result<&'a str> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| anyhow!("{field} is required for remoteSsh connection test"))
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use serde_json::json;

    use super::{
        DatabaseAdapter, DatabaseRegistry, MssqlAdapter, MySqlAdapter, PostgresAdapter,
        build_remote_mssql_database_list_command, build_remote_mssql_test_command,
        build_remote_mysql_database_list_command, build_remote_mysql_test_command,
        build_remote_postgres_database_list_command, build_remote_postgres_test_command,
        parse_database_names,
    };
    use crate::domain::{BackupJob, DatabaseConnection};

    fn connection(db_type: &str) -> DatabaseConnection {
        DatabaseConnection {
            id: "source".into(),
            name: "source".into(),
            db_type: db_type.into(),
            host: "127.0.0.1".into(),
            port: match db_type {
                "mysql" => 3306,
                "mssql" => 1433,
                _ => 5432,
            },
            username: "backup".into(),
            encrypted_password: "secret".into(),
            password: Some("secret".into()),
            database_name: Some("app".into()),
            backup_mode: "automatic".into(),
            execution_mode: "local".into(),
            remote_host: None,
            remote_port: None,
            remote_username: None,
            remote_auth_method: None,
            encrypted_remote_secret: None,
            remote_secret: None,
            remote_tool_path: None,
            remote_working_dir: None,
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
    fn registry_includes_mssql_adapter() {
        let registry = DatabaseRegistry::with_defaults();

        let adapter = registry.get("mssql").unwrap();

        assert_eq!(adapter.display_name(), "SQL Server");
        assert_eq!(adapter.config_schema().fields[1].default, Some(json!(1433)));
    }

    #[test]
    fn mssql_command_exports_bacpac_with_sqlpackage() {
        let command = MssqlAdapter
            .build_backup_command(
                &connection("mssql"),
                &job(),
                std::path::Path::new("/tmp/app.bacpac"),
            )
            .unwrap();

        assert_eq!(command.program, "sqlpackage");
        assert!(command.args.contains(&"/Action:Export".to_string()));
        assert!(
            command
                .args
                .contains(&"/SourceServerName:127.0.0.1,1433".to_string())
        );
        assert!(
            command
                .args
                .contains(&"/SourceDatabaseName:app".to_string())
        );
        assert!(command.args.contains(&"/SourceUser:backup".to_string()));
        assert!(command.args.contains(&"/SourcePassword:secret".to_string()));
        assert!(
            command
                .args
                .contains(&"/SourceTrustServerCertificate:True".to_string())
        );
        assert!(
            command
                .args
                .contains(&"/TargetFile:/tmp/app.bacpac".to_string())
        );
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

    #[test]
    fn remote_mysql_test_command_uses_mysqladmin_ping() {
        let mut connection = connection("mysql");
        connection.execution_mode = "remoteSsh".into();
        connection.host = " db.internal ".into();

        let command = build_remote_mysql_test_command(&connection);

        assert!(command.contains("MYSQL_PWD='secret' mysqladmin"));
        assert!(command.contains("-h 'db.internal'"));
        assert!(command.contains("-u 'backup' ping"));
    }

    #[test]
    fn remote_postgres_test_command_runs_authenticated_query() {
        let mut connection = connection("postgres");
        connection.execution_mode = "remoteSsh".into();

        let command = build_remote_postgres_test_command(&connection);

        assert!(command.contains("PGPASSWORD='secret' psql"));
        assert!(command.contains("-d 'app'"));
        assert!(command.contains("-w -c 'SELECT 1'"));
    }

    #[test]
    fn remote_mssql_test_command_runs_sqlcmd_query() {
        let mut connection = connection("mssql");
        connection.execution_mode = "remoteSsh".into();

        let command = build_remote_mssql_test_command(&connection);

        assert!(command.contains("sqlcmd"));
        assert!(command.contains("-S '127.0.0.1,1433'"));
        assert!(command.contains("-U 'backup'"));
        assert!(command.contains("-P 'secret'"));
        assert!(command.contains("-Q 'SELECT 1'"));
        assert!(command.contains("-C"));
        assert!(command.contains("-b"));
    }

    #[test]
    fn parses_database_list_output_with_blank_lines_removed() {
        let names = parse_database_names(b"app\n\nanalytics\n postgres \n");

        assert_eq!(names, vec!["app", "analytics", "postgres"]);
    }

    #[test]
    fn remote_mysql_database_list_command_queries_schema_names() {
        let mut connection = connection("mysql");
        connection.execution_mode = "remoteSsh".into();

        let command = build_remote_mysql_database_list_command(&connection);

        assert!(command.contains("mysql --batch --skip-column-names"));
        assert!(command.contains("SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA"));
    }

    #[test]
    fn remote_postgres_database_list_command_excludes_templates() {
        let mut connection = connection("postgres");
        connection.execution_mode = "remoteSsh".into();

        let command = build_remote_postgres_database_list_command(&connection);

        assert!(command.contains("psql"));
        assert!(command.contains("WHERE datistemplate = false"));
        assert!(command.contains("ORDER BY datname"));
    }

    #[test]
    fn remote_mssql_database_list_command_queries_user_databases() {
        let mut connection = connection("mssql");
        connection.execution_mode = "remoteSsh".into();

        let command = build_remote_mssql_database_list_command(&connection);

        assert!(command.contains("sqlcmd"));
        assert!(command.contains("-h -1"));
        assert!(command.contains("-C"));
        assert!(command.contains("FROM sys.databases"));
        assert!(command.contains("WHERE database_id > 4"));
    }
}
