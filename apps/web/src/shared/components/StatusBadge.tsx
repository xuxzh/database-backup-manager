import { Badge } from "@/components/ui/badge";
import type { BackupRun } from "@/types/api";

export function StatusBadge({ status }: { status: BackupRun["status"] }) {
  const normalized = status.toLowerCase();
  if (normalized === "success") return <Badge variant="success">{status}</Badge>;
  if (normalized === "failed") return <Badge variant="destructive">{status}</Badge>;
  if (normalized === "running") return <Badge variant="info">{status}</Badge>;
  return <Badge variant="warning">{status}</Badge>;
}