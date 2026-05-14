CREATE TABLE IF NOT EXISTS database_connections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  db_type TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  username TEXT NOT NULL,
  encrypted_password TEXT NOT NULL,
  database_name TEXT,
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backup_targets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  target_type TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  username TEXT NOT NULL,
  auth_method TEXT NOT NULL,
  encrypted_secret TEXT NOT NULL,
  base_dir TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backup_jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  database_connection_id TEXT NOT NULL,
  database_name TEXT NOT NULL,
  backup_target_id TEXT NOT NULL,
  schedule TEXT NOT NULL,
  compression TEXT NOT NULL,
  remote_retention_days INTEGER NOT NULL,
  local_retention_days INTEGER NOT NULL,
  enabled INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(database_connection_id) REFERENCES database_connections(id),
  FOREIGN KEY(backup_target_id) REFERENCES backup_targets(id)
);

CREATE TABLE IF NOT EXISTS backup_runs (
  id TEXT PRIMARY KEY,
  backup_job_id TEXT NOT NULL,
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
  FOREIGN KEY(backup_job_id) REFERENCES backup_jobs(id)
);

CREATE TABLE IF NOT EXISTS backup_run_logs (
  id TEXT PRIMARY KEY,
  backup_run_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  level TEXT NOT NULL,
  stage TEXT NOT NULL,
  message TEXT NOT NULL,
  FOREIGN KEY(backup_run_id) REFERENCES backup_runs(id)
);

