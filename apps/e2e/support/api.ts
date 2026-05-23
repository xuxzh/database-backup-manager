import { expect, type APIRequestContext } from "@playwright/test";

export type SourceFixture = {
  id: string;
  name: string;
  databaseName: string;
};

export type TargetFixture = {
  id: string;
  name: string;
};

export async function login(request: APIRequestContext): Promise<string> {
  const response = await request.post("/api/auth/login", {
    data: {
      username: "admin",
      password: "admin123",
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  return body.token;
}

export async function createSource(
  request: APIRequestContext,
  token: string,
  name: string,
): Promise<SourceFixture> {
  const databaseName = `${name}_db`;
  const response = await request.post("/api/sources", {
    headers: authHeaders(token),
    data: {
      name,
      dbType: "mysql",
      host: "127.0.0.1",
      port: 3306,
      username: "fixture_user",
      password: "fixture_password",
      databaseName,
      executionMode: "local",
      configJson: {},
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  return { id: body.id, name: body.name, databaseName };
}

export async function createTarget(
  request: APIRequestContext,
  token: string,
  name: string,
): Promise<TargetFixture> {
  const response = await request.post("/api/targets", {
    headers: authHeaders(token),
    data: {
      name,
      targetType: "ssh",
      host: "127.0.0.1",
      port: 22,
      username: "fixture_backup",
      authMethod: "password",
      secret: "fixture_password",
      baseDir: "/tmp/backup-manager-e2e",
      configJson: {},
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  return { id: body.id, name: body.name };
}

export async function createJob(
  request: APIRequestContext,
  token: string,
  input: {
    name: string;
    sourceId: string;
    targetId: string;
    databaseName: string;
  },
) {
  const response = await request.post("/api/jobs", {
    headers: authHeaders(token),
    data: {
      name: input.name,
      databaseConnectionId: input.sourceId,
      databaseName: input.databaseName,
      backupTargetId: input.targetId,
      schedule: "0 0 2 * * *",
      compression: "gzip",
      remoteRetentionDays: 30,
      localRetentionDays: 7,
      enabled: true,
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
  };
}
