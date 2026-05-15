use anyhow::Context;
use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

use crate::domain::*;

#[derive(Debug, Clone)]
pub struct Repository {
    pool: SqlitePool,
}

impl Repository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create_database_connection(
        &self,
        input: UpsertDatabaseConnection,
        encrypted_password: String,
    ) -> anyhow::Result<DatabaseConnection> {
        let input = input.normalized();
        let now = Utc::now();
        let item = DatabaseConnection {
            id: Uuid::new_v4().to_string(),
            name: input.name,
            db_type: input.db_type,
            host: input.host,
            port: input.port,
            username: input.username,
            encrypted_password,
            password: None,
            database_name: input.database_name,
            config_json: input.config_json,
            created_at: now,
            updated_at: now,
        };
        sqlx::query(
            "INSERT INTO database_connections (id, name, db_type, host, port, username, encrypted_password, database_name, config_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&item.id)
        .bind(&item.name)
        .bind(&item.db_type)
        .bind(&item.host)
        .bind(item.port)
        .bind(&item.username)
        .bind(&item.encrypted_password)
        .bind(&item.database_name)
        .bind(item.config_json.to_string())
        .bind(item.created_at.to_rfc3339())
        .bind(item.updated_at.to_rfc3339())
        .execute(&self.pool)
        .await?;
        Ok(item)
    }

    pub async fn list_database_connections(&self) -> anyhow::Result<Vec<DatabaseConnection>> {
        let rows = sqlx::query("SELECT * FROM database_connections ORDER BY created_at DESC")
            .fetch_all(&self.pool)
            .await?;
        rows.into_iter().map(row_database_connection).collect()
    }

    pub async fn get_database_connection(&self, id: &str) -> anyhow::Result<DatabaseConnection> {
        let row = sqlx::query("SELECT * FROM database_connections WHERE id = ?")
            .bind(id)
            .fetch_one(&self.pool)
            .await?;
        row_database_connection(row)
    }

    pub async fn delete_database_connection(&self, id: &str) -> anyhow::Result<bool> {
        let result = sqlx::query("DELETE FROM database_connections WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn count_jobs_by_source(&self, source_id: &str) -> anyhow::Result<i64> {
        Ok(
            sqlx::query_scalar("SELECT COUNT(*) FROM backup_jobs WHERE database_connection_id = ?")
                .bind(source_id)
                .fetch_one(&self.pool)
                .await?,
        )
    }

    pub async fn create_backup_target(
        &self,
        input: UpsertBackupTarget,
        encrypted_secret: String,
    ) -> anyhow::Result<BackupTarget> {
        let input = input.normalized();
        let now = Utc::now();
        let item = BackupTarget {
            id: Uuid::new_v4().to_string(),
            name: input.name,
            target_type: input.target_type,
            host: input.host,
            port: input.port,
            username: input.username,
            auth_method: input.auth_method,
            encrypted_secret,
            secret: None,
            base_dir: input.base_dir,
            config_json: input.config_json,
            created_at: now,
            updated_at: now,
        };
        sqlx::query(
            "INSERT INTO backup_targets (id, name, target_type, host, port, username, auth_method, encrypted_secret, base_dir, config_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&item.id)
        .bind(&item.name)
        .bind(&item.target_type)
        .bind(&item.host)
        .bind(item.port)
        .bind(&item.username)
        .bind(&item.auth_method)
        .bind(&item.encrypted_secret)
        .bind(&item.base_dir)
        .bind(item.config_json.to_string())
        .bind(item.created_at.to_rfc3339())
        .bind(item.updated_at.to_rfc3339())
        .execute(&self.pool)
        .await?;
        Ok(item)
    }

    pub async fn list_backup_targets(&self) -> anyhow::Result<Vec<BackupTarget>> {
        let rows = sqlx::query("SELECT * FROM backup_targets ORDER BY created_at DESC")
            .fetch_all(&self.pool)
            .await?;
        rows.into_iter().map(row_backup_target).collect()
    }

    pub async fn get_backup_target(&self, id: &str) -> anyhow::Result<BackupTarget> {
        let row = sqlx::query("SELECT * FROM backup_targets WHERE id = ?")
            .bind(id)
            .fetch_one(&self.pool)
            .await?;
        row_backup_target(row)
    }

    pub async fn delete_backup_target(&self, id: &str) -> anyhow::Result<bool> {
        let result = sqlx::query("DELETE FROM backup_targets WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn count_jobs_by_target(&self, target_id: &str) -> anyhow::Result<i64> {
        Ok(
            sqlx::query_scalar("SELECT COUNT(*) FROM backup_jobs WHERE backup_target_id = ?")
                .bind(target_id)
                .fetch_one(&self.pool)
                .await?,
        )
    }

    pub async fn create_backup_job(&self, input: UpsertBackupJob) -> anyhow::Result<BackupJob> {
        let input = input.normalized();
        let now = Utc::now();
        let item = BackupJob {
            id: Uuid::new_v4().to_string(),
            name: input.name,
            database_connection_id: input.database_connection_id,
            database_name: input.database_name,
            backup_target_id: input.backup_target_id,
            schedule: input.schedule,
            compression: input.compression,
            remote_retention_days: input.remote_retention_days,
            local_retention_days: input.local_retention_days,
            enabled: input.enabled,
            created_at: now,
            updated_at: now,
        };
        sqlx::query(
            "INSERT INTO backup_jobs (id, name, database_connection_id, database_name, backup_target_id, schedule, compression, remote_retention_days, local_retention_days, enabled, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&item.id)
        .bind(&item.name)
        .bind(&item.database_connection_id)
        .bind(&item.database_name)
        .bind(&item.backup_target_id)
        .bind(&item.schedule)
        .bind(&item.compression)
        .bind(item.remote_retention_days)
        .bind(item.local_retention_days)
        .bind(if item.enabled { 1 } else { 0 })
        .bind(item.created_at.to_rfc3339())
        .bind(item.updated_at.to_rfc3339())
        .execute(&self.pool)
        .await?;
        Ok(item)
    }

    pub async fn list_backup_jobs(&self) -> anyhow::Result<Vec<BackupJob>> {
        let rows = sqlx::query("SELECT * FROM backup_jobs ORDER BY created_at DESC")
            .fetch_all(&self.pool)
            .await?;
        rows.into_iter().map(row_backup_job).collect()
    }

    pub async fn list_enabled_backup_jobs(&self) -> anyhow::Result<Vec<BackupJob>> {
        let rows =
            sqlx::query("SELECT * FROM backup_jobs WHERE enabled = 1 ORDER BY created_at DESC")
                .fetch_all(&self.pool)
                .await?;
        rows.into_iter().map(row_backup_job).collect()
    }

    pub async fn get_backup_job(&self, id: &str) -> anyhow::Result<BackupJob> {
        let row = sqlx::query("SELECT * FROM backup_jobs WHERE id = ?")
            .bind(id)
            .fetch_one(&self.pool)
            .await?;
        row_backup_job(row)
    }

    pub async fn delete_backup_job(&self, id: &str) -> anyhow::Result<bool> {
        let result = sqlx::query("DELETE FROM backup_jobs WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn create_run(&self, job_id: &str) -> anyhow::Result<BackupRun> {
        let now = Utc::now();
        let run = BackupRun {
            id: Uuid::new_v4().to_string(),
            backup_job_id: job_id.to_string(),
            status: RunStatus::Pending,
            stage: "prepare".to_string(),
            started_at: now,
            finished_at: None,
            duration_ms: None,
            raw_file_name: None,
            archive_file_name: None,
            file_size: None,
            checksum: None,
            remote_path: None,
            error_message: None,
            created_at: now,
        };
        sqlx::query(
            "INSERT INTO backup_runs (id, backup_job_id, status, stage, started_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(&run.id)
        .bind(&run.backup_job_id)
        .bind(run.status.to_string())
        .bind(&run.stage)
        .bind(run.started_at.to_rfc3339())
        .bind(run.created_at.to_rfc3339())
        .execute(&self.pool)
        .await?;
        Ok(run)
    }

    pub async fn update_run_stage(
        &self,
        run_id: &str,
        status: RunStatus,
        stage: &str,
    ) -> anyhow::Result<()> {
        sqlx::query("UPDATE backup_runs SET status = ?, stage = ? WHERE id = ?")
            .bind(status.to_string())
            .bind(stage)
            .bind(run_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn finish_run_success(
        &self,
        run_id: &str,
        started_at: DateTime<Utc>,
        raw_file_name: String,
        archive_file_name: String,
        file_size: i64,
        checksum: String,
        remote_path: String,
    ) -> anyhow::Result<()> {
        let finished_at = Utc::now();
        let duration_ms = (finished_at - started_at).num_milliseconds();
        sqlx::query(
            "UPDATE backup_runs SET status = ?, stage = ?, finished_at = ?, duration_ms = ?, raw_file_name = ?, archive_file_name = ?, file_size = ?, checksum = ?, remote_path = ? WHERE id = ?",
        )
        .bind(RunStatus::Success.to_string())
        .bind("done")
        .bind(finished_at.to_rfc3339())
        .bind(duration_ms)
        .bind(raw_file_name)
        .bind(archive_file_name)
        .bind(file_size)
        .bind(checksum)
        .bind(remote_path)
        .bind(run_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn finish_run_failed(
        &self,
        run_id: &str,
        started_at: DateTime<Utc>,
        stage: &str,
        error: String,
    ) -> anyhow::Result<()> {
        let finished_at = Utc::now();
        let duration_ms = (finished_at - started_at).num_milliseconds();
        sqlx::query(
            "UPDATE backup_runs SET status = ?, stage = ?, finished_at = ?, duration_ms = ?, error_message = ? WHERE id = ?",
        )
        .bind(RunStatus::Failed.to_string())
        .bind(stage)
        .bind(finished_at.to_rfc3339())
        .bind(duration_ms)
        .bind(error)
        .bind(run_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn add_run_log(
        &self,
        run_id: &str,
        level: &str,
        stage: &str,
        message: &str,
    ) -> anyhow::Result<()> {
        let now = Utc::now();
        sqlx::query(
            "INSERT INTO backup_run_logs (id, backup_run_id, timestamp, level, stage, message)
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(run_id)
        .bind(now.to_rfc3339())
        .bind(level)
        .bind(stage)
        .bind(message)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn list_runs(&self) -> anyhow::Result<Vec<BackupRun>> {
        let rows = sqlx::query("SELECT * FROM backup_runs ORDER BY created_at DESC LIMIT 100")
            .fetch_all(&self.pool)
            .await?;
        rows.into_iter().map(row_backup_run).collect()
    }

    pub async fn list_run_logs(&self, run_id: &str) -> anyhow::Result<Vec<BackupRunLog>> {
        let rows = sqlx::query(
            "SELECT * FROM backup_run_logs WHERE backup_run_id = ? ORDER BY timestamp ASC",
        )
        .bind(run_id)
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(row_backup_run_log).collect()
    }

    pub async fn dashboard(&self) -> anyhow::Result<DashboardStats> {
        let today = Utc::now()
            .date_naive()
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_utc()
            .to_rfc3339();
        let latest = sqlx::query("SELECT * FROM backup_runs ORDER BY created_at DESC LIMIT 1")
            .fetch_optional(&self.pool)
            .await?
            .map(row_backup_run)
            .transpose()?;
        Ok(DashboardStats {
            source_count: count(&self.pool, "database_connections").await?,
            target_count: count(&self.pool, "backup_targets").await?,
            job_count: count(&self.pool, "backup_jobs").await?,
            enabled_job_count: sqlx::query_scalar(
                "SELECT COUNT(*) FROM backup_jobs WHERE enabled = 1",
            )
            .fetch_one(&self.pool)
            .await?,
            today_success_count: sqlx::query_scalar(
                "SELECT COUNT(*) FROM backup_runs WHERE status = 'Success' AND created_at >= ?",
            )
            .bind(&today)
            .fetch_one(&self.pool)
            .await?,
            today_failed_count: sqlx::query_scalar(
                "SELECT COUNT(*) FROM backup_runs WHERE status = 'Failed' AND created_at >= ?",
            )
            .bind(&today)
            .fetch_one(&self.pool)
            .await?,
            latest_run: latest,
        })
    }
}

async fn count(pool: &SqlitePool, table: &str) -> anyhow::Result<i64> {
    let sql = format!("SELECT COUNT(*) FROM {table}");
    Ok(sqlx::query_scalar(&sql).fetch_one(pool).await?)
}

fn parse_time(value: String) -> anyhow::Result<DateTime<Utc>> {
    Ok(DateTime::parse_from_rfc3339(&value)?.with_timezone(&Utc))
}

fn parse_optional_time(value: Option<String>) -> anyhow::Result<Option<DateTime<Utc>>> {
    value.map(parse_time).transpose()
}

fn parse_json(value: String) -> anyhow::Result<Value> {
    serde_json::from_str(&value).context("invalid config json")
}

fn row_database_connection(row: sqlx::sqlite::SqliteRow) -> anyhow::Result<DatabaseConnection> {
    Ok(DatabaseConnection {
        id: row.try_get("id")?,
        name: row.try_get("name")?,
        db_type: row.try_get("db_type")?,
        host: row.try_get("host")?,
        port: row.try_get("port")?,
        username: row.try_get("username")?,
        encrypted_password: row.try_get("encrypted_password")?,
        password: None,
        database_name: row.try_get("database_name")?,
        config_json: parse_json(row.try_get("config_json")?)?,
        created_at: parse_time(row.try_get("created_at")?)?,
        updated_at: parse_time(row.try_get("updated_at")?)?,
    })
}

fn row_backup_target(row: sqlx::sqlite::SqliteRow) -> anyhow::Result<BackupTarget> {
    Ok(BackupTarget {
        id: row.try_get("id")?,
        name: row.try_get("name")?,
        target_type: row.try_get("target_type")?,
        host: row.try_get("host")?,
        port: row.try_get("port")?,
        username: row.try_get("username")?,
        auth_method: row.try_get("auth_method")?,
        encrypted_secret: row.try_get("encrypted_secret")?,
        secret: None,
        base_dir: row.try_get("base_dir")?,
        config_json: parse_json(row.try_get("config_json")?)?,
        created_at: parse_time(row.try_get("created_at")?)?,
        updated_at: parse_time(row.try_get("updated_at")?)?,
    })
}

fn row_backup_job(row: sqlx::sqlite::SqliteRow) -> anyhow::Result<BackupJob> {
    Ok(BackupJob {
        id: row.try_get("id")?,
        name: row.try_get("name")?,
        database_connection_id: row.try_get("database_connection_id")?,
        database_name: row.try_get("database_name")?,
        backup_target_id: row.try_get("backup_target_id")?,
        schedule: row.try_get("schedule")?,
        compression: row.try_get("compression")?,
        remote_retention_days: row.try_get("remote_retention_days")?,
        local_retention_days: row.try_get("local_retention_days")?,
        enabled: row.try_get::<i64, _>("enabled")? == 1,
        created_at: parse_time(row.try_get("created_at")?)?,
        updated_at: parse_time(row.try_get("updated_at")?)?,
    })
}

fn parse_status(value: String) -> RunStatus {
    match value.as_str() {
        "Running" => RunStatus::Running,
        "Success" => RunStatus::Success,
        "Failed" => RunStatus::Failed,
        _ => RunStatus::Pending,
    }
}

fn row_backup_run(row: sqlx::sqlite::SqliteRow) -> anyhow::Result<BackupRun> {
    Ok(BackupRun {
        id: row.try_get("id")?,
        backup_job_id: row.try_get("backup_job_id")?,
        status: parse_status(row.try_get("status")?),
        stage: row.try_get("stage")?,
        started_at: parse_time(row.try_get("started_at")?)?,
        finished_at: parse_optional_time(row.try_get("finished_at")?)?,
        duration_ms: row.try_get("duration_ms")?,
        raw_file_name: row.try_get("raw_file_name")?,
        archive_file_name: row.try_get("archive_file_name")?,
        file_size: row.try_get("file_size")?,
        checksum: row.try_get("checksum")?,
        remote_path: row.try_get("remote_path")?,
        error_message: row.try_get("error_message")?,
        created_at: parse_time(row.try_get("created_at")?)?,
    })
}

fn row_backup_run_log(row: sqlx::sqlite::SqliteRow) -> anyhow::Result<BackupRunLog> {
    Ok(BackupRunLog {
        id: row.try_get("id")?,
        backup_run_id: row.try_get("backup_run_id")?,
        timestamp: parse_time(row.try_get("timestamp")?)?,
        level: row.try_get("level")?,
        stage: row.try_get("stage")?,
        message: row.try_get("message")?,
    })
}
