ALTER TABLE database_connections ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'local';
ALTER TABLE database_connections ADD COLUMN remote_host TEXT;
ALTER TABLE database_connections ADD COLUMN remote_port INTEGER;
ALTER TABLE database_connections ADD COLUMN remote_username TEXT;
ALTER TABLE database_connections ADD COLUMN remote_auth_method TEXT;
ALTER TABLE database_connections ADD COLUMN encrypted_remote_secret TEXT;
ALTER TABLE database_connections ADD COLUMN remote_tool_path TEXT;
ALTER TABLE database_connections ADD COLUMN remote_working_dir TEXT;
