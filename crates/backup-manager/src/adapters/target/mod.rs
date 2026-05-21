use std::{collections::HashMap, io::ErrorKind, path::Path, sync::Arc};

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

use anyhow::{anyhow, bail};
use async_trait::async_trait;
use serde_json::json;
use tokio::{fs, process::Command};
use uuid::Uuid;

use crate::domain::{BackupTarget, ConfigField, ConfigSchema};

#[derive(Debug, Clone)]
pub struct UploadRequest {
    pub target: BackupTarget,
    pub local_file: std::path::PathBuf,
    pub remote_dir: String,
}

#[derive(Debug, Clone)]
pub struct UploadResult {
    pub remote_path: String,
}

#[async_trait]
pub trait BackupTargetAdapter: Send + Sync {
    fn target_type(&self) -> &'static str;
    fn display_name(&self) -> &'static str;
    fn config_schema(&self) -> ConfigSchema;
    fn validate_config(&self, config: &BackupTarget) -> anyhow::Result<()>;
    async fn test_connection(&self, config: &BackupTarget) -> anyhow::Result<()>;
    async fn upload(&self, req: UploadRequest) -> anyhow::Result<UploadResult>;
    async fn verify(&self, target: &BackupTarget, remote_path: &str) -> anyhow::Result<()>;
}

#[derive(Clone)]
pub struct TargetRegistry {
    adapters: HashMap<String, Arc<dyn BackupTargetAdapter>>,
}

impl TargetRegistry {
    pub fn with_defaults() -> Self {
        let mut registry = Self {
            adapters: HashMap::new(),
        };
        registry.register(Arc::new(SshTargetAdapter));
        registry
    }

    pub fn register(&mut self, adapter: Arc<dyn BackupTargetAdapter>) {
        self.adapters
            .insert(adapter.target_type().to_string(), adapter);
    }

    pub fn get(&self, target_type: &str) -> anyhow::Result<Arc<dyn BackupTargetAdapter>> {
        self.adapters
            .get(target_type)
            .cloned()
            .ok_or_else(|| anyhow!("unsupported backup target type: {target_type}"))
    }

    pub fn schemas(&self) -> Vec<ConfigSchema> {
        self.adapters
            .values()
            .map(|adapter| adapter.config_schema())
            .collect()
    }
}

pub struct SshTargetAdapter;

#[async_trait]
impl BackupTargetAdapter for SshTargetAdapter {
    fn target_type(&self) -> &'static str {
        "ssh"
    }

    fn display_name(&self) -> &'static str {
        "SSH / rsync"
    }

    fn config_schema(&self) -> ConfigSchema {
        ConfigSchema {
            r#type: "ssh".to_string(),
            display_name: self.display_name().to_string(),
            fields: vec![
                ConfigField {
                    name: "host".into(),
                    label: "SSH 主机".into(),
                    field_type: "text".into(),
                    required: true,
                    default: None,
                },
                ConfigField {
                    name: "port".into(),
                    label: "SSH 端口".into(),
                    field_type: "number".into(),
                    required: true,
                    default: Some(json!(22)),
                },
                ConfigField {
                    name: "username".into(),
                    label: "SSH 用户名".into(),
                    field_type: "text".into(),
                    required: true,
                    default: None,
                },
                ConfigField {
                    name: "authMethod".into(),
                    label: "认证方式".into(),
                    field_type: "select".into(),
                    required: true,
                    default: Some(json!("key")),
                },
                ConfigField {
                    name: "secret".into(),
                    label: "私钥或密码".into(),
                    field_type: "password".into(),
                    required: true,
                    default: None,
                },
                ConfigField {
                    name: "baseDir".into(),
                    label: "远端目录".into(),
                    field_type: "text".into(),
                    required: true,
                    default: Some(json!("~/backups")),
                },
            ],
        }
    }

    fn validate_config(&self, config: &BackupTarget) -> anyhow::Result<()> {
        if config.host.trim().is_empty() {
            bail!("host is required");
        }
        if config.username.trim().is_empty() {
            bail!("username is required");
        }
        if config.base_dir.trim().is_empty() {
            bail!("base_dir is required");
        }
        if config.port <= 0 {
            bail!("port must be positive");
        }
        Ok(())
    }

    async fn test_connection(&self, config: &BackupTarget) -> anyhow::Result<()> {
        self.validate_config(config)?;
        let identity_file = prepare_identity_file_for_target(config, None).await?;
        let remote = format!("{}@{}", config.username, config.host);
        let executable = ssh_executable_name(config)?;
        let mut command = ssh_command(config, identity_file.as_deref())?;
        let output = command
            .arg(&remote)
            .arg("test")
            .arg("-w")
            .arg(&config.base_dir)
            .output()
            .await
            .map_err(command_error(executable))?;
        cleanup_identity_file(identity_file.as_deref()).await;
        if output.status.success() {
            Ok(())
        } else {
            bail!(
                "ssh writable directory test failed with status {}: {}",
                output.status,
                stderr_text(&output.stderr)
            );
        }
    }

    async fn upload(&self, req: UploadRequest) -> anyhow::Result<UploadResult> {
        self.validate_config(&req.target)?;
        let file_name = req
            .local_file
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| anyhow!("invalid local file name"))?;
        let remote_dir = format!(
            "{}/{}",
            req.target.base_dir.trim_end_matches('/'),
            req.remote_dir.trim_start_matches('/')
        );
        let remote = format!("{}@{}:{}", req.target.username, req.target.host, remote_dir);
        let identity_file = prepare_identity_file(&req).await?;
        let mkdir_remote = format!("{}@{}", req.target.username, req.target.host);
        let ssh_executable = ssh_executable_name(&req.target)?;
        let mut mkdir_command = ssh_command(&req.target, identity_file.as_deref())?;
        let mkdir_output = mkdir_command
            .arg(&mkdir_remote)
            .arg("mkdir")
            .arg("-p")
            .arg(&remote_dir)
            .output()
            .await
            .map_err(command_error(ssh_executable))?;
        if !mkdir_output.status.success() {
            cleanup_identity_file(identity_file.as_deref()).await;
            bail!(
                "failed to create remote directory with status {}: {}",
                mkdir_output.status,
                stderr_text(&mkdir_output.stderr)
            );
        }
        let rsync_executable = rsync_executable_name(&req.target)?;
        let mut rsync_command = rsync_command(&req.target, identity_file.as_deref())?;
        let output = rsync_command
            .arg("-az")
            .arg("-e")
            .arg(rsync_ssh_command(&req.target, identity_file.as_deref())?)
            .arg(
                req.local_file
                    .to_str()
                    .ok_or_else(|| anyhow!("invalid local path"))?,
            )
            .arg(&remote)
            .output()
            .await
            .map_err(command_error(rsync_executable))?;
        cleanup_identity_file(identity_file.as_deref()).await;
        if !output.status.success() {
            bail!(
                "rsync failed with status {}: {}",
                output.status,
                stderr_text(&output.stderr)
            );
        }
        Ok(UploadResult {
            remote_path: format!("{remote_dir}/{file_name}"),
        })
    }

    async fn verify(&self, target: &BackupTarget, remote_path: &str) -> anyhow::Result<()> {
        let identity_file = prepare_identity_file_for_target(target, None).await?;
        let remote = format!("{}@{}", target.username, target.host);
        let executable = ssh_executable_name(target)?;
        let mut command = ssh_command(target, identity_file.as_deref())?;
        let output = command
            .arg(&remote)
            .arg("test")
            .arg("-f")
            .arg(remote_path)
            .output()
            .await
            .map_err(command_error(executable))?;
        cleanup_identity_file(identity_file.as_deref()).await;
        if output.status.success() {
            Ok(())
        } else {
            bail!(
                "remote file verification failed with status {}: {}",
                output.status,
                stderr_text(&output.stderr)
            );
        }
    }
}

async fn prepare_identity_file(req: &UploadRequest) -> anyhow::Result<Option<std::path::PathBuf>> {
    prepare_identity_file_for_target(&req.target, None).await
}

async fn prepare_identity_file_for_target(
    target: &BackupTarget,
    dir: Option<&Path>,
) -> anyhow::Result<Option<std::path::PathBuf>> {
    if target.auth_method != "key" {
        return Ok(None);
    }
    let secret = target
        .secret
        .as_deref()
        .ok_or_else(|| anyhow!("ssh key auth requires a private key"))?;
    let dir = dir.unwrap_or_else(|| Path::new("/tmp"));
    let path = dir.join(format!(".backup-manager-ssh-key-{}", Uuid::new_v4()));
    fs::write(&path, normalize_private_key(secret)).await?;
    #[cfg(unix)]
    fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).await?;
    Ok(Some(path))
}

async fn cleanup_identity_file(path: Option<&Path>) {
    if let Some(path) = path {
        let _ = fs::remove_file(path).await;
    }
}

fn ssh_options(target: &BackupTarget, identity_file: Option<&Path>) -> anyhow::Result<Vec<String>> {
    let mut args = vec![
        "-o".to_string(),
        "StrictHostKeyChecking=accept-new".to_string(),
        "-p".to_string(),
        target.port.to_string(),
    ];
    match target.auth_method.as_str() {
        "key" => {
            let identity_file =
                identity_file.ok_or_else(|| anyhow!("missing ssh identity file"))?;
            args.push("-o".to_string());
            args.push("BatchMode=yes".to_string());
            args.push("-i".to_string());
            args.push(identity_file.display().to_string());
        }
        "password" => {
            target
                .secret
                .as_deref()
                .ok_or_else(|| anyhow!("ssh password auth requires a password"))?;
        }
        other => bail!("unsupported ssh auth method: {other}"),
    }
    Ok(args)
}

fn ssh_command(target: &BackupTarget, identity_file: Option<&Path>) -> anyhow::Result<Command> {
    match ssh_executable_name(target)? {
        "sshpass" => {
            let password = target
                .secret
                .as_deref()
                .ok_or_else(|| anyhow!("ssh password auth requires a password"))?;
            let mut command = Command::new("sshpass");
            command.arg("-e").arg("ssh").env("SSHPASS", password);
            command.args(ssh_options(target, identity_file)?);
            Ok(command)
        }
        "ssh" => {
            let mut command = Command::new("ssh");
            command.args(ssh_options(target, identity_file)?);
            Ok(command)
        }
        other => bail!("unsupported ssh executable: {other}"),
    }
}

fn rsync_command(target: &BackupTarget, identity_file: Option<&Path>) -> anyhow::Result<Command> {
    match rsync_executable_name(target)? {
        "sshpass" => {
            let password = target
                .secret
                .as_deref()
                .ok_or_else(|| anyhow!("ssh password auth requires a password"))?;
            let mut command = Command::new("sshpass");
            command.arg("-e").arg("rsync").env("SSHPASS", password);
            let _ = ssh_options(target, identity_file)?;
            Ok(command)
        }
        "rsync" => {
            let command = Command::new("rsync");
            Ok(command)
        }
        other => bail!("unsupported rsync executable: {other}"),
    }
}

fn ssh_executable_name(target: &BackupTarget) -> anyhow::Result<&'static str> {
    match target.auth_method.as_str() {
        "password" => Ok("sshpass"),
        "key" => Ok("ssh"),
        other => bail!("unsupported ssh auth method: {other}"),
    }
}

fn rsync_executable_name(target: &BackupTarget) -> anyhow::Result<&'static str> {
    match target.auth_method.as_str() {
        "password" => Ok("sshpass"),
        "key" => Ok("rsync"),
        other => bail!("unsupported ssh auth method: {other}"),
    }
}

fn rsync_ssh_command(
    target: &BackupTarget,
    identity_file: Option<&Path>,
) -> anyhow::Result<String> {
    let args = ssh_options(target, identity_file)?
        .into_iter()
        .map(|arg| shell_quote(&arg))
        .collect::<Vec<_>>()
        .join(" ");
    Ok(format!("ssh {args}"))
}

fn normalize_private_key(secret: &str) -> String {
    let mut value = secret.trim().replace("\\n", "\n");
    if !value.ends_with('\n') {
        value.push('\n');
    }
    value
}

fn stderr_text(stderr: &[u8]) -> String {
    let text = String::from_utf8_lossy(stderr).trim().to_string();
    if text.is_empty() {
        "no stderr output".to_string()
    } else {
        text
    }
}

fn shell_quote(value: &str) -> String {
    if value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || "-_=+./:@".contains(ch))
    {
        value.to_string()
    } else {
        format!("'{}'", value.replace('\'', "'\\''"))
    }
}

fn command_error(command: &'static str) -> impl FnOnce(std::io::Error) -> anyhow::Error {
    move |error| {
        if error.kind() == ErrorKind::NotFound {
            anyhow!(
                "required command `{command}` was not found. {}",
                missing_command_hint(command)
            )
        } else {
            anyhow!("failed to execute `{command}`: {error}")
        }
    }
}

fn missing_command_hint(command: &str) -> &'static str {
    match command {
        "ssh" => "请安装 openssh-client。",
        "rsync" => "请安装 rsync。",
        "sshpass" => "当前使用 SSH 密码认证，请安装 sshpass；同时需要 openssh-client 可用。",
        _ => "请确认该命令已安装并在 PATH 中。",
    }
}

#[allow(dead_code)]
fn _path_display(path: &Path) -> String {
    path.display().to_string()
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use serde_json::json;

    use super::{rsync_executable_name, ssh_executable_name};
    use crate::domain::BackupTarget;

    #[test]
    fn ssh_missing_command_name_matches_auth_method() {
        let mut target = target("key");
        assert_eq!(ssh_executable_name(&target).unwrap(), "ssh");

        target.auth_method = "password".into();
        assert_eq!(ssh_executable_name(&target).unwrap(), "sshpass");
    }

    #[test]
    fn rsync_missing_command_name_matches_auth_method() {
        let mut target = target("key");
        assert_eq!(rsync_executable_name(&target).unwrap(), "rsync");

        target.auth_method = "password".into();
        assert_eq!(rsync_executable_name(&target).unwrap(), "sshpass");
    }

    fn target(auth_method: &str) -> BackupTarget {
        let now = Utc::now();
        BackupTarget {
            id: "target".into(),
            name: "target".into(),
            target_type: "ssh".into(),
            host: "backup.example.com".into(),
            port: 22,
            username: "backup".into(),
            auth_method: auth_method.into(),
            encrypted_secret: "encrypted".into(),
            secret: Some("secret".into()),
            base_dir: "/backups".into(),
            config_json: json!({}),
            created_at: now,
            updated_at: now,
        }
    }
}
