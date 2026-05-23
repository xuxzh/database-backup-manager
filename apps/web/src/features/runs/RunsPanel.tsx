import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { BackupJob, BackupRun, BackupRunLog } from "@/types/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Check, ChevronDown, ChevronRight, Copy, Download, Pause, Play, Trash2, XCircle } from "lucide-react";
import { EmptyState } from "@/shared/components/EmptyState";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { stageLabel } from "@/shared/formatters/run";
import { formatDate } from "@/shared/formatters/date";

function mapNames(items: Array<{ id: string; name: string }>) {
  return Object.fromEntries(items.map((item) => [item.id, item.name]));
}

type CopyStatus = "idle" | "copied" | "selected" | "failed";

type RunJobGroup = {
  key: string;
  job: BackupJob | null;
  runs: BackupRun[];
};

async function copyText(text: string, fallbackTextarea: HTMLTextAreaElement | null): Promise<Exclude<CopyStatus, "idle">> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return "copied";
    } catch {
      // Fall through to selecting the visible log text when clipboard access is blocked.
    }
  }

  if (!fallbackTextarea) {
    return "failed";
  }

  fallbackTextarea.value = text;
  fallbackTextarea.focus({ preventScroll: true });
  fallbackTextarea.select();
  fallbackTextarea.setSelectionRange(0, text.length);
  return "selected";
}

export function RunsPanel({
  jobs,
  logs,
  runs,
  selectedRunId,
  onDeleteFile,
  onDownloadFile,
  onLoadLogs,
}: {
  jobs: BackupJob[];
  logs: BackupRunLog[];
  runs: BackupRun[];
  selectedRunId: string | null;
  onDeleteFile: (run: BackupRun) => void;
  onDownloadFile: (run: BackupRun) => void;
  onLoadLogs: (runId: string) => void;
}) {
  const jobNames = useMemo(() => mapNames(jobs), [jobs]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const [filterJobId, setFilterJobId] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterSearch, setFilterSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [logDialogRunId, setLogDialogRunId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const copyBufferRef = useRef<HTMLTextAreaElement>(null);
  const dialogRun = runs.find((run) => run.id === logDialogRunId) ?? null;
  const dialogLogs = selectedRunId === logDialogRunId ? logs : [];

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

  const runGroups = useMemo<RunJobGroup[]>(() => {
    const runsByJob = new Map<string, BackupRun[]>();
    for (const run of filteredRuns) {
      const jobRuns = runsByJob.get(run.backupJobId) || [];
      jobRuns.push(run);
      runsByJob.set(run.backupJobId, jobRuns);
    }

    const groups: RunJobGroup[] = jobs
      .map((job) => ({ key: job.id, job, runs: runsByJob.get(job.id) || [] }))
      .filter((group) => group.runs.length > 0);

    const knownJobIds = new Set(jobs.map((job) => job.id));
    for (const [jobId, jobRuns] of runsByJob.entries()) {
      if (!knownJobIds.has(jobId)) {
        groups.push({ key: jobId, job: null, runs: jobRuns });
      }
    }

    return groups;
  }, [filteredRuns, jobs]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [dialogLogs, autoScroll]);

  async function handleCopy() {
    const text = dialogLogs
      .map((log) => `[${formatDate(log.timestamp)}] ${log.level} ${log.stage}: ${log.message}`)
      .join("\n");
    let status: Exclude<CopyStatus, "idle"> = "failed";
    try {
      status = await copyText(text, copyBufferRef.current);
    } catch {
      status = "failed";
    }
    setCopyStatus(status);
    setTimeout(() => setCopyStatus("idle"), 2000);
  }

  function isGroupExpanded(group: RunJobGroup) {
    return expandedGroups[group.key] ?? true;
  }

  function toggleGroup(group: RunJobGroup) {
    setExpandedGroups((current) => ({
      ...current,
      [group.key]: !isGroupExpanded(group),
    }));
  }

  function groupDisplayName(group: RunJobGroup) {
    return group.job?.name || group.key;
  }

  function latestStartedAt(group: RunJobGroup) {
    return group.runs.reduce<string | null>((latest, run) => {
      if (!latest || run.startedAt > latest) return run.startedAt;
      return latest;
    }, null);
  }

  function statusSummary(group: RunJobGroup) {
    const successCount = group.runs.filter((run) => run.status === "Success").length;
    const failedCount = group.runs.filter((run) => run.status === "Failed").length;
    const runningCount = group.runs.filter((run) => run.status === "Pending" || run.status === "Running").length;
    const parts = [];
    if (successCount) parts.push(`${successCount} 成功`);
    if (failedCount) parts.push(`${failedCount} 失败`);
    if (runningCount) parts.push(`${runningCount} 执行中`);
    return parts.length ? parts.join(" / ") : "无状态";
  }

  function renderRunRow(run: BackupRun) {
    const hasRemoteFile = run.status === "Success" && Boolean(run.remotePath);
    const canManageFile = hasRemoteFile && !run.fileDeleted;

    return (
      <TableRow key={run.id} data-state={selectedRunId === run.id ? "selected" : undefined}>
        <TableCell>
          <StatusBadge status={run.status} />
        </TableCell>
        <TableCell>{stageLabel(run.stage)}</TableCell>
        <TableCell>{formatDate(run.startedAt)}</TableCell>
        <TableCell>{formatDate(run.finishedAt)}</TableCell>
        <TableCell>
          <span className="error-cell">{run.errorMessage || ""}</span>
        </TableCell>
        <TableCell className="text-right">
          <div className="run-row-actions">
            {run.fileDeleted && <Badge variant="secondary">已删除</Badge>}
            <Button type="button" size="sm" variant="outline" disabled={!hasRemoteFile || run.fileDeleted} onClick={() => onDownloadFile(run)}>
              <Download className="size-4" />
              下载备份文件
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={!canManageFile} onClick={() => onDeleteFile(run)}>
              <Trash2 className="size-4" />
              删除备份文件
            </Button>
            <Button
              type="button"
              size="sm"
              variant={selectedRunId === run.id ? "default" : "outline"}
              onClick={() => {
                setLogDialogRunId(run.id);
                setAutoScroll(true);
                setCopyStatus("idle");
                onLoadLogs(run.id);
              }}
            >
              查看日志
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
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
        <span className="text-sm text-muted-foreground ml-auto">{filteredRuns.length} 条记录</span>
      </div>

      <Card className="data-table-card run-group-card">
        <CardHeader className="data-table-header">
          <div className="min-w-0">
            <CardTitle>运行记录</CardTitle>
            <CardDescription>按备份任务分组查看执行结果，按需打开某次运行的阶段日志。</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="data-table-content">
          {runGroups.length ? (
            <Table className="run-group-table">
              <TableHeader className="sticky top-0 z-10 bg-muted/45">
                <TableRow>
                  <TableHead>任务</TableHead>
                  <TableHead>运行记录</TableHead>
                  <TableHead>状态概览</TableHead>
                  <TableHead>最近开始</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runGroups.map((group) => {
                  const expanded = isGroupExpanded(group);

                  return (
                    <Fragment key={group.key}>
                      <TableRow className="run-job-row" key={`${group.key}-job`}>
                        <TableCell className="max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap">
                          <div className="run-job-cell">
                            <Button type="button" size="sm" variant="outline" onClick={() => toggleGroup(group)}>
                              {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                              {expanded ? "收起" : "展开"}
                            </Button>
                            <span className="font-medium">{groupDisplayName(group)}</span>
                          </div>
                        </TableCell>
                        <TableCell>{group.runs.length} 条记录</TableCell>
                        <TableCell>
                          <Badge variant={group.runs.some((run) => run.status === "Failed") ? "destructive" : "secondary"}>
                            {statusSummary(group)}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(latestStartedAt(group))}</TableCell>
                        <TableCell className="text-right">
                          <Button type="button" size="sm" variant="outline" onClick={() => toggleGroup(group)}>
                            {expanded ? "收起明细" : "展开明细"}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {expanded && (
                        <TableRow aria-label={`${groupDisplayName(group)}运行明细`} className="run-child-row" key={`${group.key}-runs`}>
                          <TableCell colSpan={5}>
                            <Table className="run-child-table">
                              <TableHeader>
                                <TableRow>
                                  <TableHead>状态</TableHead>
                                  <TableHead>阶段</TableHead>
                                  <TableHead>开始时间</TableHead>
                                  <TableHead>结束时间</TableHead>
                                  <TableHead>错误</TableHead>
                                  <TableHead className="text-right">操作</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>{group.runs.map(renderRunRow)}</TableBody>
                            </Table>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <EmptyState text={runs.length ? "无符合条件的记录" : "暂无运行记录"} />
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(logDialogRunId)} onOpenChange={(open) => !open && setLogDialogRunId(null)}>
        <DialogContent className="run-log-dialog" aria-describedby="run-log-description">
          <DialogHeader className="run-log-dialog-header">
            <div className="min-w-0">
              <DialogTitle>运行日志</DialogTitle>
              <DialogDescription id="run-log-description">
                {dialogRun ? `${jobNames[dialogRun.backupJobId] || dialogRun.backupJobId} · ${formatDate(dialogRun.startedAt)}` : "正在加载运行日志"}
              </DialogDescription>
            </div>
            {dialogLogs.length > 0 && (
              <div className="run-log-actions">
                <Button type="button" variant="outline" size="sm" onClick={() => setAutoScroll(!autoScroll)}>
                  {autoScroll ? <Pause className="size-4" /> : <Play className="size-4" />}
                  {autoScroll ? "暂停滚动" : "自动滚动"}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
                  {copyStatus === "copied" || copyStatus === "selected" ? (
                    <Check className="size-4" />
                  ) : copyStatus === "failed" ? (
                    <XCircle className="size-4" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                  {copyStatus === "copied" ? "已复制" : copyStatus === "selected" ? "按 Cmd+C" : copyStatus === "failed" ? "复制失败" : "复制日志"}
                </Button>
              </div>
            )}
          </DialogHeader>

          {dialogLogs.length ? (
            <ScrollArea className="log-viewer run-log-viewer" ref={scrollRef}>
              <pre>
                {dialogLogs
                  .map((log) => `[${formatDate(log.timestamp)}] ${log.level} ${log.stage}: ${log.message}`)
                  .join("\n")}
              </pre>
              <textarea ref={copyBufferRef} className="sr-only" readOnly aria-hidden="true" tabIndex={-1} />
            </ScrollArea>
          ) : (
            <EmptyState text="正在加载日志" />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
