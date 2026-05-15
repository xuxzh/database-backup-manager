import { useMemo } from "react";
import type { BackupJob, BackupRun, BackupRunLog } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DataTable } from "@/shared/components/DataTable";
import { EmptyState } from "@/shared/components/EmptyState";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { stageLabel, latestRunLogText } from "@/shared/formatters/run";
import { formatDate } from "@/shared/formatters/date";

function mapNames(items: Array<{ id: string; name: string }>) {
  return Object.fromEntries(items.map((item) => [item.id, item.name]));
}

export function RunsPanel({
  jobs,
  logs,
  runs,
  selectedRunId,
  onLoadLogs,
}: {
  jobs: BackupJob[];
  logs: BackupRunLog[];
  runs: BackupRun[];
  selectedRunId: string | null;
  onLoadLogs: (runId: string) => void;
}) {
  const jobNames = useMemo(() => mapNames(jobs), [jobs]);

  return (
    <section className="panel">
      <DataTable
        emptyText="暂无运行记录"
        title="运行记录"
        description="查看执行结果并选择一条记录加载阶段日志。"
        headers={["任务", "状态", "阶段", "开始时间", "结束时间", "错误", "日志"]}
        rows={runs.map((run) => ({
          key: run.id,
          rowState: selectedRunId === run.id ? "selected" : undefined,
          cells: [
            <span className="font-medium">{jobNames[run.backupJobId] || run.backupJobId}</span>,
            <StatusBadge status={run.status} />,
            stageLabel(run.stage),
            formatDate(run.startedAt),
            formatDate(run.finishedAt),
            <span className="error-cell">{run.errorMessage || ""}</span>,
            <Button
              type="button"
              size="sm"
              variant={selectedRunId === run.id ? "default" : "outline"}
              onClick={() => onLoadLogs(run.id)}
            >
              查看
            </Button>,
          ],
        }))}
      />
      <Card>
        <CardHeader>
          <CardTitle>运行日志</CardTitle>
          <CardDescription>选择一条运行记录查看执行阶段日志。</CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length ? (
            <ScrollArea className="log-viewer">
              <pre>
                {logs
                  .map((log) => `[${formatDate(log.timestamp)}] ${log.level} ${log.stage}: ${log.message}`)
                  .join("\n")}
              </pre>
            </ScrollArea>
          ) : (
            <EmptyState text="选择一条运行记录查看日志" />
          )}
        </CardContent>
      </Card>
    </section>
  );
}