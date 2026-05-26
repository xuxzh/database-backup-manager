ALTER TABLE backup_runs ADD COLUMN job_name TEXT;
ALTER TABLE backup_runs ADD COLUMN source_name TEXT;
ALTER TABLE backup_runs ADD COLUMN source_type TEXT;
ALTER TABLE backup_runs ADD COLUMN source_endpoint TEXT;
ALTER TABLE backup_runs ADD COLUMN database_name TEXT;
ALTER TABLE backup_runs ADD COLUMN target_name TEXT;
ALTER TABLE backup_runs ADD COLUMN target_type TEXT;
ALTER TABLE backup_runs ADD COLUMN target_base_dir TEXT;
