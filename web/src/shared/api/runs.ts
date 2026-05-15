import type { BackupRun, BackupRunLog } from "@/types/api";
import { apiRequest } from "./http";

export async function fetchRuns(token: string): Promise<BackupRun[]> {
  return apiRequest<BackupRun[]>("/runs", { token });
}

export async function fetchRunLogs(token: string, runId: string): Promise<BackupRunLog[]> {
  return apiRequest<BackupRunLog[]>(`/runs/${runId}/logs`, { token });
}