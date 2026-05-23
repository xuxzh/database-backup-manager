import type {
  UpsertBackupJob,
  BackupJob,
} from "@/types/api";
import { stringField, numberField } from "@/shared/utils/form";

export interface JobFormValue {
  name: string;
  databaseConnectionId: string;
  databaseName: string;
  backupTargetId: string;
  schedule: string;
  compression: string;
  remoteRetentionDays: number;
  localRetentionDays: number;
  enabled: boolean;
}

export function parseJobForm(form: FormData): JobFormValue {
  return {
    name: stringField(form, "name"),
    databaseConnectionId: stringField(form, "databaseConnectionId"),
    databaseName: stringField(form, "databaseName"),
    backupTargetId: stringField(form, "backupTargetId"),
    schedule: stringField(form, "schedule"),
    compression: stringField(form, "compression"),
    remoteRetentionDays: numberField(form, "remoteRetentionDays"),
    localRetentionDays: numberField(form, "localRetentionDays"),
    enabled: form.get("enabled") === "on",
  };
}

export function toUpsertBackupJob(form: FormData): UpsertBackupJob {
  const value = parseJobForm(form);
  return {
    name: value.name,
    databaseConnectionId: value.databaseConnectionId,
    databaseName: value.databaseName,
    backupTargetId: value.backupTargetId,
    schedule: value.schedule,
    compression: value.compression,
    remoteRetentionDays: value.remoteRetentionDays,
    localRetentionDays: value.localRetentionDays,
    enabled: value.enabled,
  };
}

export function jobToFormValue(job: BackupJob): Partial<JobFormValue> {
  return {
    name: job.name,
    databaseConnectionId: job.databaseConnectionId,
    databaseName: job.databaseName,
    backupTargetId: job.backupTargetId,
    schedule: job.schedule,
    compression: job.compression,
    remoteRetentionDays: job.remoteRetentionDays,
    localRetentionDays: job.localRetentionDays,
    enabled: job.enabled,
  };
}