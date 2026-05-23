import type { BackupTarget, UpsertBackupTarget } from "@/types/api";
import { apiRequest } from "./http";

export async function fetchTargets(token: string): Promise<BackupTarget[]> {
  return apiRequest<BackupTarget[]>("/targets", { token });
}

export async function createTarget(token: string, data: UpsertBackupTarget): Promise<BackupTarget> {
  return apiRequest<BackupTarget>("/targets", {
    method: "POST",
    body: JSON.stringify(data),
    token,
  });
}

export async function deleteTarget(token: string, id: string): Promise<void> {
  return apiRequest<void>(`/targets/${id}`, { method: "DELETE", token });
}

export async function testTarget(token: string, data: UpsertBackupTarget): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>("/targets/test", {
    method: "POST",
    body: JSON.stringify(data),
    token,
  });
}
