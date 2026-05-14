use std::{collections::HashMap, path::Path, sync::Arc};

use anyhow::{anyhow, bail};
use async_trait::async_trait;
use serde_json::json;
use tokio::process::Command;

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
                    default: Some(json!("/data/backups")),
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
        let remote = format!("{}@{}", config.username, config.host);
        let status = Command::new("ssh")
            .args([
                "-o",
                "BatchMode=yes",
                "-o",
                "StrictHostKeyChecking=accept-new",
                "-p",
                &config.port.to_string(),
                &remote,
                "test",
                "-w",
                &config.base_dir,
            ])
            .status()
            .await?;
        if status.success() {
            Ok(())
        } else {
            bail!("ssh writable directory test failed with status {status}");
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
        let mkdir_remote = format!("{}@{}", req.target.username, req.target.host);
        let mkdir_status = Command::new("ssh")
            .args([
                "-p",
                &req.target.port.to_string(),
                &mkdir_remote,
                "mkdir",
                "-p",
                &remote_dir,
            ])
            .status()
            .await?;
        if !mkdir_status.success() {
            bail!("failed to create remote directory with status {mkdir_status}");
        }
        let status = Command::new("rsync")
            .args([
                "-az",
                "-e",
                &format!("ssh -p {}", req.target.port),
                req.local_file
                    .to_str()
                    .ok_or_else(|| anyhow!("invalid local path"))?,
                &remote,
            ])
            .status()
            .await?;
        if !status.success() {
            bail!("rsync failed with status {status}");
        }
        Ok(UploadResult {
            remote_path: format!("{remote_dir}/{file_name}"),
        })
    }

    async fn verify(&self, target: &BackupTarget, remote_path: &str) -> anyhow::Result<()> {
        let remote = format!("{}@{}", target.username, target.host);
        let status = Command::new("ssh")
            .args([
                "-p",
                &target.port.to_string(),
                &remote,
                "test",
                "-f",
                remote_path,
            ])
            .status()
            .await?;
        if status.success() {
            Ok(())
        } else {
            bail!("remote file verification failed with status {status}");
        }
    }
}

#[allow(dead_code)]
fn _path_display(path: &Path) -> String {
    path.display().to_string()
}
