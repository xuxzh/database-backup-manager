use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

use anyhow::Context;
use tokio_cron_scheduler::{Job, JobScheduler};
use uuid::Uuid;

use crate::{executor::BackupExecutor, repository::Repository};

#[derive(Clone)]
pub struct BackupScheduler {
    repository: Arc<Repository>,
    executor: Arc<BackupExecutor>,
    scheduler: Arc<JobScheduler>,
    scheduled_jobs: Arc<tokio::sync::Mutex<Vec<Uuid>>>,
    started: Arc<AtomicBool>,
}

impl BackupScheduler {
    pub async fn new(
        repository: Arc<Repository>,
        executor: Arc<BackupExecutor>,
    ) -> anyhow::Result<Self> {
        Ok(Self {
            repository,
            executor,
            scheduler: Arc::new(JobScheduler::new().await?),
            scheduled_jobs: Arc::new(tokio::sync::Mutex::new(Vec::new())),
            started: Arc::new(AtomicBool::new(false)),
        })
    }

    pub async fn reload(&self) -> anyhow::Result<()> {
        let mut scheduled_jobs = self.scheduled_jobs.lock().await;
        for scheduled_job_id in scheduled_jobs.drain(..) {
            self.scheduler.remove(&scheduled_job_id).await?;
        }

        let jobs = self.repository.list_enabled_backup_jobs().await?;
        for backup_job in jobs {
            let job_id = backup_job.id.clone();
            let executor = self.executor.clone();
            let cron = normalize_schedule(&backup_job.schedule);
            let schedule_job = Job::new_async(cron.as_str(), move |_uuid, _lock| {
                let executor = executor.clone();
                let job_id = job_id.clone();
                Box::pin(async move {
                    if let Err(error) = executor.enqueue(job_id).await {
                        tracing::error!(%error, "failed to enqueue scheduled backup job");
                    }
                })
            })
            .with_context(|| format!("invalid cron schedule for job {}", backup_job.name))?;
            let scheduled_job_id = self.scheduler.add(schedule_job).await?;
            scheduled_jobs.push(scheduled_job_id);
        }

        if !self.started.swap(true, Ordering::SeqCst) {
            if let Err(error) = self.scheduler.start().await {
                self.started.store(false, Ordering::SeqCst);
                return Err(error.into());
            }
        }

        Ok(())
    }
}

fn normalize_schedule(schedule: &str) -> String {
    if schedule.split_whitespace().count() == 5 {
        format!("0 {schedule}")
    } else {
        schedule.to_string()
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use serde_json::json;
    use sqlx::sqlite::SqlitePoolOptions;

    use super::*;
    use crate::{
        adapters::{database::DatabaseRegistry, target::TargetRegistry},
        crypto::Crypto,
        domain::{UpsertBackupJob, UpsertBackupTarget, UpsertDatabaseConnection},
        executor::BackupExecutor,
        repository::Repository,
    };

    #[tokio::test]
    async fn reload_can_run_more_than_once() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();

        let repository = Arc::new(Repository::new(pool));
        let source = repository
            .create_database_connection(
                UpsertDatabaseConnection {
                    name: "source".into(),
                    db_type: "mysql".into(),
                    host: "127.0.0.1".into(),
                    port: 3306,
                    username: "root".into(),
                    password: "secret".into(),
                    database_name: Some("app".into()),
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
                "encrypted".into(),
                None,
            )
            .await
            .unwrap();
        let target = repository
            .create_backup_target(
                UpsertBackupTarget {
                    name: "target".into(),
                    target_type: "ssh".into(),
                    host: "127.0.0.1".into(),
                    port: 22,
                    username: "root".into(),
                    auth_method: "password".into(),
                    secret: "secret".into(),
                    base_dir: "~/backups".into(),
                    config_json: json!({}),
                },
                "encrypted".into(),
            )
            .await
            .unwrap();
        repository
            .create_backup_job(UpsertBackupJob {
                name: "daily".into(),
                database_connection_id: source.id,
                database_name: "app".into(),
                backup_target_id: target.id,
                schedule: "0 0 2 * * *".into(),
                compression: "gzip".into(),
                remote_retention_days: 30,
                local_retention_days: 7,
                enabled: true,
            })
            .await
            .unwrap();

        let executor = Arc::new(BackupExecutor::new(
            repository.clone(),
            Arc::new(DatabaseRegistry::with_defaults()),
            Arc::new(TargetRegistry::with_defaults()),
            Arc::new(Crypto::new("test-secret").unwrap()),
            std::env::temp_dir(),
        ));
        let scheduler = BackupScheduler::new(repository, executor).await.unwrap();

        scheduler.reload().await.unwrap();
        scheduler.reload().await.unwrap();
    }
}
