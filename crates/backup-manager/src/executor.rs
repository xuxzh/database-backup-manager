use std::{
    collections::HashSet,
    io::ErrorKind,
    path::PathBuf,
    sync::{Arc, Mutex},
};

use anyhow::{Context, anyhow};
use chrono::Utc;
use serde_json::json;
use sha2::{Digest, Sha256};
use tokio::{fs, io::AsyncWriteExt, process::Command};

use crate::{
    adapters::{
        database::DatabaseRegistry,
        target::{TargetRegistry, UploadRequest},
    },
    crypto::Crypto,
    domain::{BackupRun, RunStatus},
    repository::Repository,
};

#[derive(Clone)]
pub struct BackupExecutor {
    repository: Arc<Repository>,
    database_registry: Arc<DatabaseRegistry>,
    target_registry: Arc<TargetRegistry>,
    crypto: Arc<Crypto>,
    backups_dir: PathBuf,
    running_jobs: Arc<Mutex<HashSet<String>>>,
}

impl BackupExecutor {
    pub fn new(
        repository: Arc<Repository>,
        database_registry: Arc<DatabaseRegistry>,
        target_registry: Arc<TargetRegistry>,
        crypto: Arc<Crypto>,
        backups_dir: PathBuf,
    ) -> Self {
        Self {
            repository,
            database_registry,
            target_registry,
            crypto,
            backups_dir,
            running_jobs: Arc::new(Mutex::new(HashSet::new())),
        }
    }

    pub async fn enqueue(&self, job_id: String) -> anyhow::Result<BackupRun> {
        let run = self.repository.create_run(&job_id).await?;
        let executor = self.clone();
        let run_clone = run.clone();
        tokio::spawn(async move {
            if let Err(error) = executor.execute(run_clone).await {
                tracing::error!(%error, "backup execution failed");
            }
        });
        Ok(run)
    }

    async fn execute(&self, run: BackupRun) -> anyhow::Result<()> {
        let job = self.repository.get_backup_job(&run.backup_job_id).await?;
        let already_running = {
            let mut running = self.running_jobs.lock().expect("running job lock poisoned");
            !running.insert(job.id.clone())
        };
        if already_running {
            self.repository
                .finish_run_failed(
                    &run.id,
                    run.started_at,
                    "prepare",
                    "job is already running".to_string(),
                )
                .await?;
            return Ok(());
        }

        let result = self.execute_inner(&run).await;
        self.running_jobs
            .lock()
            .expect("running job lock poisoned")
            .remove(&job.id);
        result
    }

    async fn execute_inner(&self, run: &BackupRun) -> anyhow::Result<()> {
        let started_at = run.started_at;
        if let Err(error) = self.execute_steps(run).await {
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

    async fn execute_steps(&self, run: &BackupRun) -> anyhow::Result<()> {
        self.stage(run, "prepare", "准备备份上下文").await?;
        let job = self.repository.get_backup_job(&run.backup_job_id).await?;
        let mut source = self
            .repository
            .get_database_connection(&job.database_connection_id)
            .await?;
        let mut target = self
            .repository
            .get_backup_target(&job.backup_target_id)
            .await?;
        let database_adapter = self.database_registry.get(&source.db_type)?;
        let target_adapter = self.target_registry.get(&target.target_type)?;

        let run_dir = self.backups_dir.join(&job.id).join(&run.id);
        fs::create_dir_all(&run_dir).await?;
        let now = Utc::now();
        let backup_date = now.format("%Y-%m-%d").to_string();
        let timestamp = now.format("%Y-%m-%d_%H%M%S").to_string();
        let database_slug = path_slug(&job.database_name);
        let raw_file_name = if source.db_type == "postgres" {
            format!("{database_slug}_{timestamp}.dump")
        } else {
            format!("{database_slug}_{timestamp}.sql")
        };
        let raw_path = run_dir.join(&raw_file_name);
        source.password = Some(self.crypto.decrypt(&source.encrypted_password)?);
        target.secret = Some(self.crypto.decrypt(&target.encrypted_secret)?);

        self.stage(run, "dump", "执行数据库导出命令").await?;
        let command = database_adapter.build_backup_command(&source, &job, &raw_path)?;
        let mut child = Command::new(&command.program);
        child.args(&command.args);
        if source.db_type == "mysql" {
            child.env("MYSQL_PWD", source.password.as_deref().unwrap_or_default());
        }
        if source.db_type == "postgres" {
            child.env("PGPASSWORD", source.password.as_deref().unwrap_or_default());
        }
        let output = child.output().await.map_err(|error| {
            if error.kind() == ErrorKind::NotFound {
                anyhow!(
                    "stage=dump 未找到数据库客户端工具 `{}`。请在运行环境安装 {}，或通过 {} 指定可执行文件绝对路径: {}",
                    command.program,
                    client_install_hint(&source.db_type),
                    dump_tool_env_name(&source.db_type),
                    error
                )
            } else {
                anyhow!(
                    "stage=dump failed to run {}: {}",
                    command.program,
                    error
                )
            }
        })?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow!(
                "stage=dump {} failed: {}",
                command.program,
                truncate(&stderr, 2000)
            ));
        }

        self.stage(run, "compress", "压缩备份文件").await?;
        let archive_file_name = format!("{raw_file_name}.gz");
        let archive_path = run_dir.join(&archive_file_name);
        let gzip_status = Command::new("gzip")
            .args(["-c", raw_path.to_str().context("invalid raw backup path")?])
            .output()
            .await?;
        if !gzip_status.status.success() {
            return Err(anyhow!(
                "stage=compress gzip failed: {}",
                String::from_utf8_lossy(&gzip_status.stderr)
            ));
        }
        fs::write(&archive_path, gzip_status.stdout).await?;

        self.stage(run, "checksum", "计算 checksum 并写入 manifest")
            .await?;
        let archive_bytes = fs::read(&archive_path).await?;
        let checksum = hex::encode(Sha256::digest(&archive_bytes));
        let file_size = archive_bytes.len() as i64;
        let sha_path = run_dir.join(format!("{archive_file_name}.sha256"));
        fs::write(&sha_path, format!("{checksum}  {archive_file_name}\n")).await?;
        let manifest = json!({
            "databaseType": source.db_type,
            "databaseName": job.database_name,
            "jobName": job.name,
            "runId": run.id,
            "archiveFileName": archive_file_name,
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
        let remote_dir = format!(
            "{}/{}/{}/{}",
            path_slug(&source.host),
            path_slug(&source.db_type),
            database_slug,
            backup_date
        );
        let upload = target_adapter
            .upload(UploadRequest {
                target: target.clone(),
                local_file: archive_path.clone(),
                remote_dir,
            })
            .await
            .map_err(|error| anyhow!("stage=upload {error:#}"))?;

        self.stage(run, "verify_remote", "验证远端文件存在").await?;
        target_adapter
            .verify(&target, &upload.remote_path)
            .await
            .map_err(|error| anyhow!("stage=verify_remote {error:#}"))?;

        self.stage(run, "local_cleanup", "清理本地保留文件").await?;
        self.repository
            .finish_run_success(
                &run.id,
                run.started_at,
                raw_file_name,
                archive_file_name,
                file_size,
                checksum,
                upload.remote_path,
            )
            .await?;
        self.repository
            .add_run_log(&run.id, "INFO", "done", "备份执行完成")
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

fn path_slug(value: &str) -> String {
    let mut output = String::new();
    let mut pending_separator = false;

    for ch in value.trim().chars() {
        if ch.is_ascii_alphanumeric() || ch == '_' {
            if pending_separator && !output.is_empty() {
                output.push('-');
            }
            output.push(ch);
            pending_separator = false;
        } else {
            pending_separator = !output.is_empty();
        }
    }

    if output.is_empty() {
        "unnamed".to_string()
    } else {
        output
    }
}

fn dump_tool_env_name(db_type: &str) -> &'static str {
    match db_type {
        "mysql" => "MYSQLDUMP_PATH",
        "postgres" => "PG_DUMP_PATH",
        _ => "对应数据库适配器的客户端路径环境变量",
    }
}

fn client_install_hint(db_type: &str) -> &'static str {
    match db_type {
        "mysql" => {
            "MySQL 客户端工具，例如 macOS 上的 `brew install mysql-client` 或容器内的 `default-mysql-client`"
        }
        "postgres" => {
            "PostgreSQL 客户端工具，例如 macOS 上的 `brew install libpq` 或容器内的 `postgresql-client`"
        }
        _ => "对应数据库客户端工具",
    }
}

fn truncate(value: &str, max: usize) -> String {
    if value.len() <= max {
        value.to_string()
    } else {
        format!("{}...", &value[..max])
    }
}

#[cfg(test)]
mod tests {
    use super::path_slug;

    #[test]
    fn path_slug_normalizes_path_segments() {
        assert_eq!(path_slug("192.168.0.135"), "192-168-0-135");
        assert_eq!(path_slug(" 192.168.0.135 "), "192-168-0-135");
        assert_eq!(path_slug("135AAC---"), "135AAC");
        assert_eq!(path_slug("RH_AAC"), "RH_AAC");
        assert_eq!(path_slug("---...---"), "unnamed");
    }
}
