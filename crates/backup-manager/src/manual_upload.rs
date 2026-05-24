use std::{path::PathBuf, sync::Arc};

use anyhow::{Context, anyhow, bail};
use chrono::Utc;
use serde_json::json;
use sha2::{Digest, Sha256};
use tokio::{fs, io::AsyncWriteExt};

use crate::{
    adapters::target::{TargetRegistry, UploadRequest},
    config::AppConfig,
    crypto::Crypto,
    domain::{BackupRun, CreateManualBackupUpload, ManualBackupUpload, RunStatus},
    path_utils::path_slug,
    repository::Repository,
};

#[derive(Clone)]
pub struct ManualUploadExecutor {
    config: Arc<AppConfig>,
    repository: Arc<Repository>,
    target_registry: Arc<TargetRegistry>,
    crypto: Arc<Crypto>,
    backups_dir: PathBuf,
}

impl ManualUploadExecutor {
    pub fn new(
        config: Arc<AppConfig>,
        repository: Arc<Repository>,
        target_registry: Arc<TargetRegistry>,
        crypto: Arc<Crypto>,
        backups_dir: PathBuf,
    ) -> Self {
        Self {
            config,
            repository,
            target_registry,
            crypto,
            backups_dir,
        }
    }

    pub async fn enqueue(
        &self,
        input: CreateManualBackupUpload,
        file_bytes: Vec<u8>,
    ) -> anyhow::Result<BackupRun> {
        self.validate_file(&input.original_file_name, file_bytes.len() as u64)?;
        let (run, upload) = self.repository.create_manual_run(input).await?;
        let executor = self.clone();
        let run_clone = run.clone();
        tokio::spawn(async move {
            if let Err(error) = executor.execute(run_clone, upload, file_bytes).await {
                tracing::error!(%error, "manual upload failed");
            }
        });
        Ok(run)
    }

    fn validate_file(&self, file_name: &str, size: u64) -> anyhow::Result<()> {
        if size == 0 {
            bail!("uploaded file is empty");
        }
        if size > self.config.max_manual_upload_bytes {
            bail!("uploaded file exceeds max_manual_upload_bytes");
        }
        let lower = file_name.to_ascii_lowercase();
        let allowed = self
            .config
            .manual_upload_allowed_extensions
            .iter()
            .any(|ext| lower.ends_with(&format!(".{ext}")));
        if !allowed {
            bail!("uploaded file extension is not allowed");
        }
        Ok(())
    }

    async fn execute(
        &self,
        run: BackupRun,
        upload: ManualBackupUpload,
        file_bytes: Vec<u8>,
    ) -> anyhow::Result<()> {
        let started_at = run.started_at;
        if let Err(error) = self.execute_inner(&run, &upload, file_bytes).await {
            let message = format!("{error:#}");
            let stage = current_stage_from_error(&message).to_string();
            self.repository
                .add_run_log(&run.id, "ERROR", &stage, &message)
                .await?;
            self.repository
                .finish_run_failed(&run.id, started_at, &stage, message)
                .await?;
        }
        Ok(())
    }

    async fn execute_inner(
        &self,
        run: &BackupRun,
        upload: &ManualBackupUpload,
        file_bytes: Vec<u8>,
    ) -> anyhow::Result<()> {
        self.stage(run, "prepare", "准备手动上传上下文").await?;
        let mut target = self
            .repository
            .get_backup_target(&upload.backup_target_id)
            .await?;
        let target_adapter = self.target_registry.get(&target.target_type)?;
        target.secret = Some(self.crypto.decrypt(&target.encrypted_secret)?);

        self.stage(run, "receive_file", "接收并保存上传文件")
            .await?;
        let run_dir = self.backups_dir.join("manual").join(&run.id);
        fs::create_dir_all(&run_dir).await?;
        let archive_file_name = safe_file_name(&upload.original_file_name)?;
        let archive_path = run_dir.join(&archive_file_name);
        let mut archive_file = fs::File::create(&archive_path).await?;
        archive_file.write_all(&file_bytes).await?;
        archive_file.flush().await?;

        self.stage(run, "checksum", "计算 checksum").await?;
        let checksum = hex::encode(Sha256::digest(&file_bytes));
        let file_size = file_bytes.len() as i64;
        let sha_path = run_dir.join(format!("{archive_file_name}.sha256"));
        fs::write(&sha_path, format!("{checksum}  {archive_file_name}\n")).await?;

        self.stage(run, "manifest", "生成备份 manifest").await?;
        let manifest = json!({
            "runType": "manualUpload",
            "sourceLabel": upload.source_label,
            "databaseType": upload.database_type,
            "databaseName": upload.database_name,
            "runId": run.id,
            "archiveFileName": archive_file_name,
            "originalFileName": upload.original_file_name,
            "fileSize": file_size,
            "checksum": checksum,
            "startedAt": run.started_at,
            "applicationVersion": env!("CARGO_PKG_VERSION"),
        });
        let mut manifest_file = fs::File::create(run_dir.join("manifest.json")).await?;
        manifest_file
            .write_all(serde_json::to_string_pretty(&manifest)?.as_bytes())
            .await?;

        self.stage(run, "upload", "上传备份文件到远端目标").await?;
        let backup_date = Utc::now().format("%Y-%m-%d").to_string();
        let remote_dir = format!(
            "manual/{}/{}/{}/{}",
            path_slug(&upload.source_label),
            path_slug(&upload.database_type),
            path_slug(&upload.database_name),
            backup_date
        );
        let uploaded = target_adapter
            .upload(UploadRequest {
                target: target.clone(),
                local_file: archive_path,
                remote_dir,
            })
            .await
            .map_err(|error| anyhow!("stage=upload {error:#}"))?;

        self.stage(run, "verify_remote", "验证远端文件存在").await?;
        target_adapter
            .verify(&target, &uploaded.remote_path)
            .await
            .map_err(|error| anyhow!("stage=verify_remote {error:#}"))?;

        self.repository
            .finish_run_success(
                &run.id,
                run.started_at,
                archive_file_name.clone(),
                archive_file_name,
                file_size,
                checksum,
                uploaded.remote_path,
            )
            .await?;
        self.repository
            .add_run_log(&run.id, "INFO", "done", "手动上传完成")
            .await?;
        Ok(())
    }

    async fn stage(&self, run: &BackupRun, stage: &str, message: &str) -> anyhow::Result<()> {
        self.repository
            .update_run_stage(&run.id, RunStatus::Running, stage)
            .await?;
        self.repository
            .add_run_log(&run.id, "INFO", stage, message)
            .await?;
        Ok(())
    }
}

fn current_stage_from_error(message: &str) -> &str {
    message
        .split_whitespace()
        .find_map(|part| part.strip_prefix("stage="))
        .unwrap_or("failed")
}

fn safe_file_name(value: &str) -> anyhow::Result<String> {
    let name = PathBuf::from(value)
        .file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .context("invalid uploaded file name")?;
    if name == "." || name == ".." || name.contains('/') || name.contains('\\') {
        bail!("invalid uploaded file name");
    }
    Ok(name)
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use sqlx::sqlite::SqlitePoolOptions;

    use super::*;

    async fn executor(max_manual_upload_bytes: u64) -> ManualUploadExecutor {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        let config = Arc::new(AppConfig {
            bind_addr: "127.0.0.1:8080".into(),
            data_dir: "data".into(),
            backups_dir: "backups".into(),
            database_path: "data/app.db".into(),
            admin_username: "admin".into(),
            admin_password: "admin123".into(),
            app_secret: "secret".into(),
            default_target_base_dir: "~/backups".into(),
            max_manual_upload_bytes,
            manual_upload_allowed_extensions: vec!["gz".into(), "tar.gz".into()],
        });
        ManualUploadExecutor::new(
            config.clone(),
            Arc::new(Repository::new(pool)),
            Arc::new(TargetRegistry::with_defaults()),
            Arc::new(Crypto::new(&config.app_secret).unwrap()),
            std::env::temp_dir(),
        )
    }

    #[tokio::test]
    async fn validate_file_allows_configured_extensions() {
        let executor = executor(10).await;

        executor.validate_file("app.sql.gz", 3).unwrap();
        executor.validate_file("app.tar.gz", 3).unwrap();
    }

    #[tokio::test]
    async fn validate_file_rejects_empty_oversized_and_unknown_extensions() {
        let executor = executor(2).await;

        assert!(executor.validate_file("app.sql.gz", 0).is_err());
        assert!(executor.validate_file("app.sql.gz", 3).is_err());
        assert!(executor.validate_file("app.sql", 1).is_err());
    }

    #[test]
    fn safe_file_name_strips_path_segments() {
        assert_eq!(safe_file_name("app.sql.gz").unwrap(), "app.sql.gz");
        assert_eq!(safe_file_name("../app.sql.gz").unwrap(), "app.sql.gz");
        assert_eq!(safe_file_name("nested/app.sql.gz").unwrap(), "app.sql.gz");
    }
}
