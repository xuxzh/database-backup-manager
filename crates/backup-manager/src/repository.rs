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
        encrypted_remote_secret: Option<String>,
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
            backup_mode: input.backup_mode,
            execution_mode: input.execution_mode,
            remote_host: input.remote_host,
            remote_port: input.remote_port,
            remote_username: input.remote_username,
            remote_auth_method: input.remote_auth_method,
            encrypted_remote_secret,
            remote_secret: None,
            remote_tool_path: input.remote_tool_path,
            remote_working_dir: input.remote_working_dir,
            config_json: input.config_json,
            created_at: now,
            updated_at: now,
        };
        sqlx::query(
            "INSERT INTO database_connections (id, name, db_type, host, port, username, encrypted_password, database_name, backup_mode, execution_mode, remote_host, remote_port, remote_username, remote_auth_method, encrypted_remote_secret, remote_tool_path, remote_working_dir, config_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&item.id)
        .bind(&item.name)
        .bind(&item.db_type)
        .bind(&item.host)
        .bind(item.port)
        .bind(&item.username)
        .bind(&item.encrypted_password)
        .bind(&item.database_name)
        .bind(&item.backup_mode)
        .bind(&item.execution_mode)
        .bind(&item.remote_host)
        .bind(item.remote_port)
        .bind(&item.remote_username)
        .bind(&item.remote_auth_method)
        .bind(&item.encrypted_remote_secret)
        .bind(&item.remote_tool_path)
        .bind(&item.remote_working_dir)
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

    pub async fn update_database_connection(
        &self,
        id: &str,
        input: UpsertDatabaseConnection,
        encrypted_password: String,
        encrypted_remote_secret: Option<String>,
    ) -> anyhow::Result<Option<DatabaseConnection>> {
        let input = input.normalized();
        let now = Utc::now();
        let result = sqlx::query(
            "UPDATE database_connections
             SET name = ?, db_type = ?, host = ?, port = ?, username = ?, encrypted_password = ?, database_name = ?, backup_mode = ?, execution_mode = ?, remote_host = ?, remote_port = ?, remote_username = ?, remote_auth_method = ?, encrypted_remote_secret = ?, remote_tool_path = ?, remote_working_dir = ?, config_json = ?, updated_at = ?
             WHERE id = ?",
        )
        .bind(&input.name)
        .bind(&input.db_type)
        .bind(&input.host)
        .bind(input.port)
        .bind(&input.username)
        .bind(&encrypted_password)
        .bind(&input.database_name)
        .bind(&input.backup_mode)
        .bind(&input.execution_mode)
        .bind(&input.remote_host)
        .bind(input.remote_port)
        .bind(&input.remote_username)
        .bind(&input.remote_auth_method)
        .bind(&encrypted_remote_secret)
        .bind(&input.remote_tool_path)
        .bind(&input.remote_working_dir)
        .bind(input.config_json.to_string())
        .bind(now.to_rfc3339())
        .bind(id)
        .execute(&self.pool)
        .await?;
        if result.rows_affected() == 0 {
            return Ok(None);
        }
        self.get_database_connection(id).await.map(Some)
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

    pub async fn update_backup_target(
        &self,
        id: &str,
        input: UpsertBackupTarget,
        encrypted_secret: String,
    ) -> anyhow::Result<Option<BackupTarget>> {
        let input = input.normalized();
        let now = Utc::now();
        let result = sqlx::query(
            "UPDATE backup_targets
             SET name = ?, target_type = ?, host = ?, port = ?, username = ?, auth_method = ?, encrypted_secret = ?, base_dir = ?, config_json = ?, updated_at = ?
             WHERE id = ?",
        )
        .bind(&input.name)
        .bind(&input.target_type)
        .bind(&input.host)
        .bind(input.port)
        .bind(&input.username)
        .bind(&input.auth_method)
        .bind(&encrypted_secret)
        .bind(&input.base_dir)
        .bind(input.config_json.to_string())
        .bind(now.to_rfc3339())
        .bind(id)
        .execute(&self.pool)
        .await?;
        if result.rows_affected() == 0 {
            return Ok(None);
        }
        self.get_backup_target(id).await.map(Some)
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

    pub async fn update_backup_job(
        &self,
        id: &str,
        input: UpsertBackupJob,
    ) -> anyhow::Result<Option<BackupJob>> {
        let input = input.normalized();
        let now = Utc::now();
        let result = sqlx::query(
            "UPDATE backup_jobs
             SET name = ?, database_connection_id = ?, database_name = ?, backup_target_id = ?, schedule = ?, compression = ?, remote_retention_days = ?, local_retention_days = ?, enabled = ?, updated_at = ?
             WHERE id = ?",
        )
        .bind(&input.name)
        .bind(&input.database_connection_id)
        .bind(&input.database_name)
        .bind(&input.backup_target_id)
        .bind(&input.schedule)
        .bind(&input.compression)
        .bind(input.remote_retention_days)
        .bind(input.local_retention_days)
        .bind(if input.enabled { 1 } else { 0 })
        .bind(now.to_rfc3339())
        .bind(id)
        .execute(&self.pool)
        .await?;
        if result.rows_affected() == 0 {
            return Ok(None);
        }
        self.get_backup_job(id).await.map(Some)
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
            run_type: "scheduled".to_string(),
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
            file_deleted: false,
            file_deleted_at: None,
            error_message: None,
            created_at: now,
        };
        sqlx::query(
            "INSERT INTO backup_runs (id, backup_job_id, run_type, status, stage, started_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&run.id)
        .bind(Option::<String>::None)
        .bind(&run.run_type)
        .bind(run.status.to_string())
        .bind(&run.stage)
        .bind(run.started_at.to_rfc3339())
        .bind(run.created_at.to_rfc3339())
        .execute(&self.pool)
        .await?;
        Ok(run)
    }

    pub async fn create_manual_run(
        &self,
        input: CreateManualBackupUpload,
    ) -> anyhow::Result<(BackupRun, ManualBackupUpload)> {
        let now = Utc::now();
        let run = BackupRun {
            id: Uuid::new_v4().to_string(),
            backup_job_id: String::new(),
            run_type: "manualUpload".to_string(),
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
            file_deleted: false,
            file_deleted_at: None,
            error_message: None,
            created_at: now,
        };
        let upload = ManualBackupUpload {
            id: Uuid::new_v4().to_string(),
            backup_run_id: run.id.clone(),
            database_connection_id: input.database_connection_id,
            backup_target_id: input.backup_target_id,
            source_label: input.source_label,
            database_type: input.database_type,
            database_name: input.database_name,
            original_file_name: input.original_file_name,
            note: input.note,
            created_at: now,
        };

        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "INSERT INTO backup_runs (id, backup_job_id, run_type, status, stage, started_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&run.id)
        .bind(&run.backup_job_id)
        .bind(&run.run_type)
        .bind(run.status.to_string())
        .bind(&run.stage)
        .bind(run.started_at.to_rfc3339())
        .bind(run.created_at.to_rfc3339())
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "INSERT INTO manual_backup_uploads (id, backup_run_id, database_connection_id, backup_target_id, source_label, database_type, database_name, original_file_name, note, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&upload.id)
        .bind(&upload.backup_run_id)
        .bind(&upload.database_connection_id)
        .bind(&upload.backup_target_id)
        .bind(&upload.source_label)
        .bind(&upload.database_type)
        .bind(&upload.database_name)
        .bind(&upload.original_file_name)
        .bind(&upload.note)
        .bind(upload.created_at.to_rfc3339())
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok((run, upload))
    }

    pub async fn get_manual_upload_by_run_id(
        &self,
        run_id: &str,
    ) -> anyhow::Result<ManualBackupUpload> {
        let row = sqlx::query("SELECT * FROM manual_backup_uploads WHERE backup_run_id = ?")
            .bind(run_id)
            .fetch_one(&self.pool)
            .await?;
        row_manual_backup_upload(row)
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

    #[allow(clippy::too_many_arguments)]
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

    pub async fn get_run(&self, run_id: &str) -> anyhow::Result<BackupRun> {
        let row = sqlx::query("SELECT * FROM backup_runs WHERE id = ?")
            .bind(run_id)
            .fetch_one(&self.pool)
            .await?;
        row_backup_run(row)
    }

    pub async fn mark_run_file_deleted(&self, run_id: &str) -> anyhow::Result<()> {
        let deleted_at = Utc::now();
        sqlx::query("UPDATE backup_runs SET file_deleted = 1, file_deleted_at = ? WHERE id = ?")
            .bind(deleted_at.to_rfc3339())
            .bind(run_id)
            .execute(&self.pool)
            .await?;
        Ok(())
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
        backup_mode: row.try_get("backup_mode")?,
        execution_mode: row.try_get("execution_mode")?,
        remote_host: row.try_get("remote_host")?,
        remote_port: row.try_get("remote_port")?,
        remote_username: row.try_get("remote_username")?,
        remote_auth_method: row.try_get("remote_auth_method")?,
        encrypted_remote_secret: row.try_get("encrypted_remote_secret")?,
        remote_secret: None,
        remote_tool_path: row.try_get("remote_tool_path")?,
        remote_working_dir: row.try_get("remote_working_dir")?,
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
        database_connection_id: row
            .try_get::<Option<String>, _>("database_connection_id")?
            .unwrap_or_default(),
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
        backup_job_id: row
            .try_get::<Option<String>, _>("backup_job_id")?
            .unwrap_or_default(),
        run_type: row.try_get("run_type")?,
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
        file_deleted: row.try_get::<i64, _>("file_deleted")? == 1,
        file_deleted_at: parse_optional_time(row.try_get("file_deleted_at")?)?,
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

fn row_manual_backup_upload(row: sqlx::sqlite::SqliteRow) -> anyhow::Result<ManualBackupUpload> {
    Ok(ManualBackupUpload {
        id: row.try_get("id")?,
        backup_run_id: row.try_get("backup_run_id")?,
        database_connection_id: row.try_get("database_connection_id")?,
        backup_target_id: row.try_get("backup_target_id")?,
        source_label: row.try_get("source_label")?,
        database_type: row.try_get("database_type")?,
        database_name: row.try_get("database_name")?,
        original_file_name: row.try_get("original_file_name")?,
        note: row.try_get("note")?,
        created_at: parse_time(row.try_get("created_at")?)?,
    })
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use sqlx::sqlite::SqlitePoolOptions;

    use super::*;

    #[tokio::test]
    async fn mark_run_file_deleted_hides_remote_file_from_future_downloads() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();

        let repository = Repository::new(pool);
        let source = repository
            .create_database_connection(
                UpsertDatabaseConnection {
                    name: "source".into(),
                    db_type: "mysql".into(),
                    host: "db".into(),
                    port: 3306,
                    username: "backup".into(),
                    password: String::new(),
                    database_name: Some("app".into()),
                    backup_mode: "automatic".into(),
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
                    host: "backup".into(),
                    port: 22,
                    username: "backup".into(),
                    auth_method: "password".into(),
                    secret: String::new(),
                    base_dir: "/backups".into(),
                    config_json: json!({}),
                },
                "encrypted".into(),
            )
            .await
            .unwrap();
        let job = repository
            .create_backup_job(UpsertBackupJob {
                name: "job".into(),
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
        let run = repository.create_run(&job.id).await.unwrap();
        repository
            .finish_run_success(
                &run.id,
                run.started_at,
                "app.sql".into(),
                "app.sql.gz".into(),
                1024,
                "checksum".into(),
                "/backups/app.sql.gz".into(),
            )
            .await
            .unwrap();

        repository.mark_run_file_deleted(&run.id).await.unwrap();

        let updated = repository.get_run(&run.id).await.unwrap();
        assert!(updated.file_deleted);
        assert!(updated.file_deleted_at.is_some());
    }

    #[tokio::test]
    async fn create_manual_run_records_upload_metadata_and_run_type() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();

        let repository = Repository::new(pool);
        let source = repository
            .create_database_connection(
                UpsertDatabaseConnection {
                    name: "offline-db".into(),
                    db_type: "mysql".into(),
                    host: String::new(),
                    port: 3306,
                    username: String::new(),
                    password: String::new(),
                    database_name: Some("app".into()),
                    backup_mode: "manual".into(),
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
                String::new(),
                None,
            )
            .await
            .unwrap();
        let target = repository
            .create_backup_target(
                UpsertBackupTarget {
                    name: "target".into(),
                    target_type: "ssh".into(),
                    host: "backup".into(),
                    port: 22,
                    username: "backup".into(),
                    auth_method: "password".into(),
                    secret: String::new(),
                    base_dir: "/backups".into(),
                    config_json: json!({}),
                },
                "encrypted".into(),
            )
            .await
            .unwrap();

        let (run, upload) = repository
            .create_manual_run(CreateManualBackupUpload {
                database_connection_id: source.id.clone(),
                backup_target_id: target.id.clone(),
                source_label: "offline-db".into(),
                database_type: "mysql".into(),
                database_name: "app".into(),
                original_file_name: "app.sql.gz".into(),
                note: Some("from offline host".into()),
            })
            .await
            .unwrap();

        let saved = repository.get_run(&run.id).await.unwrap();
        let saved_upload = repository
            .get_manual_upload_by_run_id(&run.id)
            .await
            .unwrap();
        assert_eq!(saved.run_type, "manualUpload");
        assert_eq!(saved.backup_job_id, "");
        assert_eq!(upload.backup_run_id, run.id);
        assert_eq!(upload.database_connection_id, source.id);
        assert_eq!(upload.backup_target_id, target.id);
        assert_eq!(upload.source_label, "offline-db");
        assert_eq!(upload.database_type, "mysql");
        assert_eq!(upload.database_name, "app");
        assert_eq!(upload.original_file_name, "app.sql.gz");
        assert_eq!(upload.note.as_deref(), Some("from offline host"));
        assert_eq!(saved_upload.id, upload.id);
    }

    #[tokio::test]
    async fn create_database_connection_allows_manual_backup_without_credentials() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();

        let repository = Repository::new(pool);
        let source = repository
            .create_database_connection(
                UpsertDatabaseConnection {
                    name: "offline source".into(),
                    db_type: "mysql".into(),
                    host: "offline-host".into(),
                    port: 3306,
                    username: String::new(),
                    password: String::new(),
                    database_name: Some("app".into()),
                    backup_mode: "manual".into(),
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
                String::new(),
                None,
            )
            .await
            .unwrap();

        assert_eq!(source.backup_mode, "manual");
        assert_eq!(source.host, "offline-host");
        assert_eq!(source.port, 3306);
        assert_eq!(source.username, "");
        assert_eq!(source.database_name.as_deref(), Some("app"));
    }
}
