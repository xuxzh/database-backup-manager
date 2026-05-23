import { formatDate } from "@/shared/formatters/date";
import { StatusBadge } from "./StatusBadge";
import { stageLabel, formatDuration } from "@/shared/formatters/run";
import type { BackupRun } from "@/types/api";

export function RunSummary({ run, onClick }: { run: BackupRun; onClick?: () => void }) {
  return (
    <dl className="run-summary" onClick={onClick} style={onClick ? { cursor: "pointer" } : undefined}>
      <div>
        <dt>状态</dt>
        <dd>
          <StatusBadge status={run.status} />
        </dd>
      </div>
      <div>
        <dt>阶段</dt>
        <dd>{stageLabel(run.stage)}</dd>
      </div>
      <div>
        <dt>开始时间</dt>
        <dd>{formatDate(run.startedAt)}</dd>
      </div>
      <div>
        <dt>结束时间</dt>
        <dd>{formatDate(run.finishedAt)}</dd>
      </div>
      <div>
        <dt>耗时</dt>
        <dd>{formatDuration(run.durationMs) || "-"}</dd>
      </div>
      {run.remotePath && (
        <div className="wide">
          <dt>远端路径</dt>
          <dd className="font-mono text-sm">{run.remotePath}</dd>
        </div>
      )}
      {run.errorMessage && (
        <div className="wide">
          <dt>错误</dt>
          <dd className="text-destructive">{run.errorMessage}</dd>
        </div>
      )}
    </dl>
  );
}