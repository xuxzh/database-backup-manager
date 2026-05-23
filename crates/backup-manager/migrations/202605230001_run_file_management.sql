ALTER TABLE backup_runs ADD COLUMN file_deleted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE backup_runs ADD COLUMN file_deleted_at TEXT;
