import type {
  UpsertBackupTarget,
  BackupTarget,
} from "@/types/api";
import { stringField, optionalStringField, numberField } from "@/shared/utils/form";

export interface TargetFormValue {
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: string;
  secret: string;
  baseDir: string;
}

export function parseTargetForm(form: FormData): TargetFormValue {
  return {
    name: stringField(form, "name"),
    host: stringField(form, "host"),
    port: numberField(form, "port"),
    username: stringField(form, "username"),
    authMethod: stringField(form, "authMethod"),
    secret: stringField(form, "secret"),
    baseDir: stringField(form, "baseDir"),
  };
}

export function toUpsertBackupTarget(form: FormData): UpsertBackupTarget {
  const value = parseTargetForm(form);
  return {
    name: value.name,
    targetType: "ssh",
    host: value.host,
    port: value.port,
    username: value.username,
    authMethod: value.authMethod,
    secret: value.secret,
    baseDir: value.baseDir,
    configJson: {},
  };
}

export function targetToFormValue(target: BackupTarget): Partial<TargetFormValue> {
  return {
    name: target.name,
    host: target.host,
    port: target.port,
    username: target.username,
    authMethod: target.authMethod,
    baseDir: target.baseDir,
  };
}