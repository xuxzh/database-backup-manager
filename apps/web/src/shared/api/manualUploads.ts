import { ApiError } from "@/api/client";
import type { BackupRun } from "@/types/api";

export async function uploadManualBackup(token: string, data: FormData): Promise<BackupRun> {
  const response = await fetch("/api/manual-uploads", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: data,
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(payload?.message || response.statusText || "手动上传失败", response.status, payload?.code);
  }

  return payload as BackupRun;
}
