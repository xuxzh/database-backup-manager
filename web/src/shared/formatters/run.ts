import type { BackupRun, BackupRunLog } from "@/types/api";
import { formatDuration } from "./duration";
import { formatDate } from "./date";

export { formatDuration };

export function stageLabel(stage: string) {
  const labels: Record<string, string> = {
    pending: "等待调度",
    prepare: "准备上下文",
    dump: "导出数据库",
    compress: "压缩备份文件",
    checksum: "计算校验值",
    upload: "上传远端",
    verify_remote: "验证远端文件",
    local_cleanup: "清理本地文件",
    done: "执行完成",
    failed: "执行失败",
  };
  return labels[stage] || stage;
}

export function latestRunLogText(logs: BackupRunLog[]) {
  const latest = logs[logs.length - 1];
  if (!latest) return "正在等待第一条执行日志";
  return `${stageLabel(latest.stage)}：${latest.message}`;
}

export function isRunInProgress(run: BackupRun | null) {
  return run?.status === "Pending" || run?.status === "Running";
}

export function runningDuration(run: BackupRun) {
  if (!isRunInProgress(run)) return "";
  const startedAt = new Date(run.startedAt).getTime();
  if (Number.isNaN(startedAt)) return "进行中";
  return formatDuration(Date.now() - startedAt) || "进行中";
}