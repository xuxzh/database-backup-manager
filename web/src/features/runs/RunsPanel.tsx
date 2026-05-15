import { useMemo, useRef, useState, useEffect } from "react";
import type { BackupJob, BackupRun, BackupRunLog } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Pause, Play, Check } from "lucide-react";
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
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const [filterJobId, setFilterJobId] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterSearch, setFilterSearch] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const filteredRuns = useMemo(() => {
    return runs.filter((run) => {
      if (filterJobId !== "all" && run.backupJobId !== filterJobId) return false;
      if (filterStatus !== "all" && run.status !== filterStatus) return false;
      if (filterSearch) {
        const search = filterSearch.toLowerCase();
        const matchesError = run.errorMessage?.toLowerCase().includes(search);
        const matchesStage = run.stage.toLowerCase().includes(search);
        if (!matchesError && !matchesStage) return false;
      }
      return true;
    });
  }, [runs, filterJobId, filterStatus, filterSearch]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  async function handleCopy() {
    const text = logs
      .map((log) => `[${formatDate(log.timestamp)}] ${log.level} ${log.stage}: ${log.message}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="panel">
      <div className="filter-bar">
        <Select value={filterJobId} onValueChange={setFilterJobId}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="筛选任务" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部任务</SelectItem>
            {jobs.map((job) => (
              <SelectItem key={job.id} value={job.id}>
                {job.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="筛选状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="Pending">Pending</SelectItem>
            <SelectItem value="Running">Running</SelectItem>
            <SelectItem value="Success">Success</SelectItem>
            <SelectItem value="Failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Input
          className="w-48"
          placeholder="搜索错误/阶段"
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
        />
        {filterSearch && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setFilterSearch("")}>
            清除
          </Button>
        )}
        <span className="text-sm text-muted-foreground ml-auto">
          {filteredRuns.length} 条记录
        </span>
      </div>

      <DataTable
        emptyText={runs.length ? "无符合条件的记录" : "暂无运行记录"}
        title="运行记录"
        description="查看执行结果并选择一条记录加载阶段日志。"
        headers={["任务", "状态", "阶段", "开始时间", "结束时间", "错误", "日志"]}
        rows={filteredRuns.map((run) => ({
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
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>运行日志</CardTitle>
            <CardDescription>选择一条运行记录查看执行阶段日志。</CardDescription>
          </div>
          {logs.length > 0 && (
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAutoScroll(!autoScroll)}>
                {autoScroll ? <Pause className="size-4" /> : <Play className="size-4" />}
                {autoScroll ? "暂停滚动" : "自动滚动"}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "已复制" : "复制日志"}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {logs.length ? (
            <ScrollArea className="log-viewer" ref={scrollRef}>
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