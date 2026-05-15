import { formatDate } from "@/shared/formatters/date";
import { StatusBadge } from "./StatusBadge";
import type { BackupRun } from "@/types/api";

export function RunSummary({ run }: { run: BackupRun }) {
  return (
    <dl className="run-summary">
      <div>
        <dt>状态</dt>
        <dd>
          <StatusBadge status={run.status} />
        </dd>
      </div>
      <div>
        <dt>阶段</dt>
        <dd>{run.stage}</dd>
      </div>
      <div>
        <dt>开始时间</dt>
        <dd>{formatDate(run.startedAt)}</dd>
      </div>
      <div>
        <dt>结束时间</dt>
        <dd>{formatDate(run.finishedAt)}</dd>
      </div>
      {run.errorMessage && (
        <div className="wide">
          <dt>错误</dt>
          <dd>{run.errorMessage}</dd>
        </div>
      )}
    </dl>
  );
}