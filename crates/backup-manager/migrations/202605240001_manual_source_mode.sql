ALTER TABLE database_connections ADD COLUMN backup_mode TEXT NOT NULL DEFAULT 'automatic';
ALTER TABLE manual_backup_uploads ADD COLUMN database_connection_id TEXT;
