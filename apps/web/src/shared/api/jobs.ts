import type { BackupJob, BackupRun, UpsertBackupJob } from "@/types/api";
import { apiRequest } from "./http";

export async function fetchJobs(token: string): Promise<BackupJob[]> {
  return apiRequest<BackupJob[]>("/jobs", { token });
}

export async function createJob(token: string, data: UpsertBackupJob): Promise<BackupJob> {
  return apiRequest<BackupJob>("/jobs", {
    method: "POST",
    body: JSON.stringify(data),
    token,
  });
}

export async function deleteJob(token: string, id: string): Promise<void> {
  return apiRequest<void>(`/jobs/${id}`, { method: "DELETE", token });
}

export async function runJob(token: string, jobId: string): Promise<BackupRun> {
  return apiRequest<BackupRun>(`/jobs/${jobId}/run`, { method: "POST", token });
}