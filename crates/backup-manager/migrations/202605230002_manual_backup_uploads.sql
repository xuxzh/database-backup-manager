PRAGMA defer_foreign_keys = ON;

CREATE TABLE backup_runs_new (
  id TEXT PRIMARY KEY,
  backup_job_id TEXT,
  run_type TEXT NOT NULL DEFAULT 'scheduled',
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_ms INTEGER,
  raw_file_name TEXT,
  archive_file_name TEXT,
  file_size INTEGER,
  checksum TEXT,
  remote_path TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  file_deleted INTEGER NOT NULL DEFAULT 0,
  file_deleted_at TEXT
);

INSERT INTO backup_runs_new (
  id,
  backup_job_id,
  run_type,
  status,
  stage,
  started_at,
  finished_at,
  duration_ms,
  raw_file_name,
  archive_file_name,
  file_size,
  checksum,
  remote_path,
  error_message,
  created_at,
  file_deleted,
  file_deleted_at
)
SELECT
  id,
  backup_job_id,
  'scheduled',
  status,
  stage,
  started_at,
  finished_at,
  duration_ms,
  raw_file_name,
  archive_file_name,
  file_size,
  checksum,
  remote_path,
  error_message,
  created_at,
  file_deleted,
  file_deleted_at
FROM backup_runs;

CREATE TABLE backup_run_logs_new (
  id TEXT PRIMARY KEY,
  backup_run_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  level TEXT NOT NULL,
  stage TEXT NOT NULL,
  message TEXT NOT NULL
);

INSERT INTO backup_run_logs_new (
  id,
  backup_run_id,
  timestamp,
  level,
  stage,
  message
)
SELECT
  id,
  backup_run_id,
  timestamp,
  level,
  stage,
  message
FROM backup_run_logs;

DROP TABLE backup_run_logs;
DROP TABLE backup_runs;
ALTER TABLE backup_runs_new RENAME TO backup_runs;

CREATE TABLE backup_run_logs (
  id TEXT PRIMARY KEY,
  backup_run_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  level TEXT NOT NULL,
  stage TEXT NOT NULL,
  message TEXT NOT NULL,
  FOREIGN KEY(backup_run_id) REFERENCES backup_runs(id)
);

INSERT INTO backup_run_logs (
  id,
  backup_run_id,
  timestamp,
  level,
  stage,
  message
)
SELECT
  id,
  backup_run_id,
  timestamp,
  level,
  stage,
  message
FROM backup_run_logs_new;

DROP TABLE backup_run_logs_new;

CREATE TABLE IF NOT EXISTS manual_backup_uploads (
  id TEXT PRIMARY KEY,
  backup_run_id TEXT NOT NULL,
  backup_target_id TEXT NOT NULL,
  source_label TEXT NOT NULL,
  database_type TEXT NOT NULL,
  database_name TEXT NOT NULL,
  original_file_name TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(backup_run_id) REFERENCES backup_runs(id),
  FOREIGN KEY(backup_target_id) REFERENCES backup_targets(id)
);
