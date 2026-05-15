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
  };
}