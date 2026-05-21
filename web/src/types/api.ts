export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ConfigField = {
  name: string;
  label: string;
  fieldType: string;
  required: boolean;
  default: JsonValue | null;
};

export type ConfigSchema = {
  type: string;
  displayName: string;
  fields: ConfigField[];
};

export type DatabaseConnection = {
  id: string;
  name: string;
  dbType: string;
  host: string;
  port: number;
  username: string;
  password: string | null;
  databaseName: string | null;
  executionMode: string;
  remoteHost: string | null;
  remotePort: number | null;
  remoteUsername: string | null;
  remoteAuthMethod: string | null;
  remoteSecret: string | null;
  remoteToolPath: string | null;
  remoteWorkingDir: string | null;
  configJson: JsonValue;
  createdAt: string;
  updatedAt: string;
};

export type UpsertDatabaseConnection = {
  name: string;
  dbType: string;
  host: string;
  port: number;
  username: string;
  password: string;
  databaseName?: string;
  executionMode: string;
  remoteHost?: string;
  remotePort?: number;
  remoteUsername?: string;
  remoteAuthMethod?: string;
  remoteSecret?: string;
  remoteToolPath?: string;
  remoteWorkingDir?: string;
  configJson: JsonValue;
};

export type TestDatabaseConnectionResult = {
  ok: boolean;
  databases: string[];
};

export type BackupTarget = {
  id: string;
  name: string;
  targetType: string;
  host: string;
  port: number;
  username: string;
  authMethod: string;
  secret: string | null;
  baseDir: string;
  configJson: JsonValue;
  createdAt: string;
  updatedAt: string;
};

export type UpsertBackupTarget = {
  name: string;
  targetType: string;
  host: string;
  port: number;
  username: string;
  authMethod: string;
  secret: string;
  baseDir: string;
  configJson: JsonValue;
};

export type BackupJob = {
  id: string;
  name: string;
  databaseConnectionId: string;
  databaseName: string;
  backupTargetId: string;
  schedule: string;
  compression: string;
  remoteRetentionDays: number;
  localRetentionDays: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UpsertBackupJob = {
  name: string;
  databaseConnectionId: string;
  databaseName: string;
  backupTargetId: string;
  schedule: string;
  compression: string;
  remoteRetentionDays: number;
  localRetentionDays: number;
  enabled: boolean;
};

export type RunStatus = "Pending" | "Running" | "Success" | "Failed";

export type BackupRun = {
  id: string;
  backupJobId: string;
  status: RunStatus;
  stage: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  rawFileName: string | null;
  archiveFileName: string | null;
  fileSize: number | null;
  checksum: string | null;
  remotePath: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type BackupRunLog = {
  id: string;
  backupRunId: string;
  timestamp: string;
  level: string;
  stage: string;
  message: string;
};

export type DashboardStats = {
  sourceCount: number;
  targetCount: number;
  jobCount: number;
  enabledJobCount: number;
  todaySuccessCount: number;
  todayFailedCount: number;
  latestRun: BackupRun | null;
};
