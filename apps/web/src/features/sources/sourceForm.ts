import type {
  UpsertDatabaseConnection,
  DatabaseConnection,
} from "@/types/api";
import { stringField, optionalStringField, numberField } from "@/shared/utils/form";

export interface SourceFormValue {
  name: string;
  dbType: string;
  host: string;
  port: number;
  username: string;
  password: string;
  databaseName?: string;
  backupMode: string;
  executionMode: string;
  remoteHost?: string;
  remotePort?: number;
  remoteUsername?: string;
  remoteAuthMethod?: string;
  remoteSecret?: string;
  remoteToolPath?: string;
  remoteWorkingDir?: string;
}

export function parseSourceForm(form: FormData): SourceFormValue {
  return {
    name: stringField(form, "name"),
    dbType: stringField(form, "dbType"),
    host: stringField(form, "host"),
    port: numberField(form, "port"),
    username: stringField(form, "username"),
    password: stringField(form, "password"),
    databaseName: optionalStringField(form, "databaseName"),
    backupMode: stringField(form, "backupMode") || "automatic",
    executionMode: stringField(form, "executionMode") || "local",
    remoteHost: optionalStringField(form, "remoteHost"),
    remotePort: form.get("remotePort")?.toString().trim()
      ? numberField(form, "remotePort")
      : undefined,
    remoteUsername: optionalStringField(form, "remoteUsername"),
    remoteAuthMethod: optionalStringField(form, "remoteAuthMethod"),
    remoteSecret: optionalStringField(form, "remoteSecret"),
    remoteToolPath: optionalStringField(form, "remoteToolPath"),
    remoteWorkingDir: optionalStringField(form, "remoteWorkingDir"),
  };
}

export function toUpsertDatabaseConnection(form: FormData): UpsertDatabaseConnection {
  const value = parseSourceForm(form);
  return {
    name: value.name,
    dbType: value.dbType,
    host: value.host,
    port: value.port,
    username: value.username,
    password: value.password,
    databaseName: value.databaseName,
    backupMode: value.backupMode as "automatic" | "manual",
    executionMode: value.executionMode,
    remoteHost: value.remoteHost,
    remotePort: value.remotePort,
    remoteUsername: value.remoteUsername,
    remoteAuthMethod: value.remoteAuthMethod,
    remoteSecret: value.remoteSecret,
    remoteToolPath: value.remoteToolPath,
    remoteWorkingDir: value.remoteWorkingDir,
    configJson: {},
  };
}

export function sourceToFormValue(source: DatabaseConnection): Partial<SourceFormValue> {
  return {
    name: source.name,
    dbType: source.dbType,
    host: source.host,
    port: source.port,
    username: source.username,
    databaseName: source.databaseName ?? undefined,
    backupMode: source.backupMode,
    executionMode: source.executionMode,
    remoteHost: source.remoteHost ?? undefined,
    remotePort: source.remotePort ?? undefined,
    remoteUsername: source.remoteUsername ?? undefined,
    remoteAuthMethod: source.remoteAuthMethod ?? undefined,
    remoteToolPath: source.remoteToolPath ?? undefined,
    remoteWorkingDir: source.remoteWorkingDir ?? undefined,
  };
}
