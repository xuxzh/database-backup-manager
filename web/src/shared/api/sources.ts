import type { DatabaseConnection, UpsertDatabaseConnection } from "@/types/api";
import { apiRequest } from "./http";

export async function fetchSources(token: string): Promise<DatabaseConnection[]> {
  return apiRequest<DatabaseConnection[]>("/sources", { token });
}

export async function createSource(token: string, data: UpsertDatabaseConnection): Promise<DatabaseConnection> {
  return apiRequest<DatabaseConnection>("/sources", {
    method: "POST",
    body: JSON.stringify(data),
    token,
  });
}

export async function deleteSource(token: string, id: string): Promise<void> {
  return apiRequest<void>(`/sources/${id}`, { method: "DELETE", token });
}

export async function testSource(token: string, data: UpsertDatabaseConnection): Promise<DatabaseConnection> {
  return apiRequest<DatabaseConnection>("/sources/test", {
    method: "POST",
    body: JSON.stringify(data),
    token,
  });
}