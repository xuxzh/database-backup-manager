use std::sync::Arc;

use anyhow::Context;
use tokio_cron_scheduler::{Job, JobScheduler};

use crate::{executor::BackupExecutor, repository::Repository};

#[derive(Clone)]
pub struct BackupScheduler {
    repository: Arc<Repository>,
    executor: Arc<BackupExecutor>,
    scheduler: Arc<JobScheduler>,
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
        })
    }

    pub async fn reload(&self) -> anyhow::Result<()> {
        self.scheduler.start().await?;
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
            self.scheduler.add(schedule_job).await?;
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
