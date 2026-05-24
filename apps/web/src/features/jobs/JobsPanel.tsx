import { Fragment, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { BackupJob, BackupRun, BackupRunLog, DatabaseConnection, BackupTarget } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertCircle, ChevronDown, ChevronRight, ListChecks, Play } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { EmptyState } from "@/shared/components/EmptyState";
import { Field } from "@/shared/components/Field";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { DismissibleAlert } from "@/shared/components/DismissibleAlert";
import { IconButton } from "./IconButton";
import { jobToFormValue } from "./jobForm";
import { stageLabel, latestRunLogText, isRunInProgress, runningDuration } from "@/shared/formatters/run";
import { formatDate } from "@/shared/formatters/date";
import { formatDuration } from "@/shared/formatters/duration";
import { validateRetentionDays, validateRequiredString, validateCronExpression } from "@/shared/utils/validators";

type SubmitResult = Promise<boolean>;

const cronTemplates = [
  { label: "每天 02:00", value: "0 0 2 * * *" },
  { label: "每 6 小时", value: "0 0 */6 * * *" },
  { label: "每周日 03:00", value: "0 0 3 * * 0" },
];

type JobSourceGroup = {
  key: string;
  source: DatabaseConnection | null;
  jobs: BackupJob[];
};

function mapNames(items: Array<{ id: string; name: string }>) {
  return Object.fromEntries(items.map((item) => [item.id, item.name]));
}

export function JobsPanel({
  activeRun,
  activeRunLogs,
  isSubmitting,
  jobs,
  sources,
  targets,
  onDelete,
  onGoToSources,
  onGoToTargets,
  onLoadSourceDatabases,
  onRun,
  onSubmit,
  onViewRun,
}: {
  activeRun: BackupRun | null;
  activeRunLogs: BackupRunLog[];
  isSubmitting: boolean;
  jobs: BackupJob[];
  sources: DatabaseConnection[];
  targets: BackupTarget[];
  onDelete: (job: BackupJob) => void;
  onGoToSources: () => void;
  onGoToTargets: () => void;
  onLoadSourceDatabases: (sourceId: string) => Promise<string[]>;
  onRun: (jobId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>, job: BackupJob | null) => SubmitResult;
  onViewRun: (runId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<BackupJob | null>(null);
  const [schedule, setSchedule] = useState(cronTemplates[0].value);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [databaseName, setDatabaseName] = useState("");
  const [databaseOptions, setDatabaseOptions] = useState<string[]>([]);
  const [isLoadingDatabases, setIsLoadingDatabases] = useState(false);
  const [databaseLoadMessage, setDatabaseLoadMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const targetNames = useMemo(() => mapNames(targets), [targets]);
  const activeJobName = activeRun ? jobs.find((job) => job.id === activeRun.backupJobId)?.name : null;
  const jobGroups = useMemo<JobSourceGroup[]>(() => {
    const jobsBySource = new Map<string, BackupJob[]>();
    for (const job of jobs) {
      const sourceJobs = jobsBySource.get(job.databaseConnectionId) || [];
      sourceJobs.push(job);
      jobsBySource.set(job.databaseConnectionId, sourceJobs);
    }

    const groups: JobSourceGroup[] = sources.map((source) => ({
      key: source.id,
      source,
      jobs: jobsBySource.get(source.id) || [],
    }));

    const knownSourceIds = new Set(sources.map((source) => source.id));
    const orphanJobs = jobs.filter((job) => !knownSourceIds.has(job.databaseConnectionId));
    if (orphanJobs.length) {
      groups.push({ key: "__unknown-source", source: null, jobs: orphanJobs });
    }

    return groups;
  }, [jobs, sources]);

  function validateForm(form: FormData): boolean {
    const errors: Record<string, string> = {};
    const nameResult = validateRequiredString(form.get("name")?.toString() || "", "任务名称");
    if (!nameResult.valid) errors.name = nameResult.message!;
    const dbNameResult = validateRequiredString(form.get("databaseName")?.toString() || "", "备份数据库");
    if (!dbNameResult.valid) errors.databaseName = dbNameResult.message!;
    const cronResult = validateCronExpression(form.get("schedule")?.toString() || "");
    if (!cronResult.valid) errors.schedule = cronResult.message!;
    const remoteDays = Number(form.get("remoteRetentionDays"));
    const remoteResult = validateRetentionDays(remoteDays);
    if (!remoteResult.valid) errors.remoteRetentionDays = remoteResult.message!;
    const localDays = Number(form.get("localRetentionDays"));
    const localResult = validateRetentionDays(localDays);
    if (!localResult.valid) errors.localRetentionDays = localResult.message!;
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): SubmitResult {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setGlobalError("");
    if (!validateForm(form)) return false;
    const ok = await onSubmit(event, editingJob);
    if (ok) resetDialog(false);
    return ok;
  }

  function resetDialog(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setEditingJob(null);
      setSchedule(cronTemplates[0].value);
      setSelectedSourceId("");
      setDatabaseName("");
      setDatabaseOptions([]);
      setIsLoadingDatabases(false);
      setDatabaseLoadMessage("");
      setFieldErrors({});
      setGlobalError("");
    }
  }

  function openCreateDialog() {
    setEditingJob(null);
    setSchedule(cronTemplates[0].value);
    setSelectedSourceId("");
    setDatabaseName("");
    setDatabaseOptions([]);
    setIsLoadingDatabases(false);
    setDatabaseLoadMessage("");
    setFieldErrors({});
    setGlobalError("");
    setOpen(true);
  }

  function openEditDialog(job: BackupJob) {
    setEditingJob(job);
    setSchedule(job.schedule);
    setSelectedSourceId(job.databaseConnectionId);
    setDatabaseName(job.databaseName);
    setDatabaseOptions([job.databaseName]);
    setIsLoadingDatabases(false);
    setDatabaseLoadMessage("");
    setFieldErrors({});
    setGlobalError("");
    setOpen(true);
    loadDatabases(job.databaseConnectionId, job.databaseName);
  }

  function handleSourceChange(sourceId: string) {
    setSelectedSourceId(sourceId);
    const source = sources.find((source) => source.id === sourceId);
    const defaultDatabase = source?.databaseName;
    setDatabaseName(defaultDatabase || "");
    if (source?.backupMode === "manual") {
      setDatabaseOptions([]);
      setDatabaseLoadMessage("手动备份数据源需手动输入数据库名。");
      return;
    }
    loadDatabases(sourceId, defaultDatabase || "");
  }

  async function loadDatabases(sourceId: string, preferredDatabase: string) {
    setDatabaseOptions(preferredDatabase ? [preferredDatabase] : []);
    setDatabaseLoadMessage("");
    setIsLoadingDatabases(true);

    try {
      const databases = await onLoadSourceDatabases(sourceId);
      const options = Array.from(new Set([preferredDatabase, ...databases].filter(Boolean)));
      setDatabaseOptions(options);
      setDatabaseName(
        preferredDatabase && options.includes(preferredDatabase)
          ? preferredDatabase
          : options[0] || "",
      );
      if (options.length === 0) {
        setDatabaseLoadMessage("未获取到数据库列表，可手动输入库名。");
      }
    } catch {
      setDatabaseOptions([]);
      setDatabaseName(preferredDatabase);
      setDatabaseLoadMessage("数据库列表获取失败，可手动输入库名。");
    } finally {
      setIsLoadingDatabases(false);
    }
  }

  const editingValue = editingJob ? jobToFormValue(editingJob) : null;
  const isEditing = Boolean(editingJob);

  function isGroupExpanded(group: JobSourceGroup) {
    return expandedGroups[group.key] ?? group.jobs.length > 0;
  }

  function toggleGroup(group: JobSourceGroup) {
    const expanded = isGroupExpanded(group);
    setExpandedGroups((current) => ({ ...current, [group.key]: !expanded }));
  }

  function sourceDisplayName(group: JobSourceGroup) {
    return group.source?.name || "未知数据源";
  }

  function sourceEndpoint(group: JobSourceGroup) {
    if (group.source?.backupMode === "manual") return "手动上传";
    return group.source ? `${group.source.host}:${group.source.port}` : "任务引用的数据源不存在";
  }

  function sourceType(group: JobSourceGroup) {
    return group.source?.dbType || "unknown";
  }

  function enabledJobCount(group: JobSourceGroup) {
    return group.jobs.filter((job) => job.enabled).length;
  }

  function runningJobCount(group: JobSourceGroup) {
    return group.jobs.filter((job) => activeRun?.backupJobId === job.id && isRunInProgress(activeRun)).length;
  }

  function renderJobRow(job: BackupJob) {
    const isCurrentJobRunning = activeRun?.backupJobId === job.id && isRunInProgress(activeRun);

    return (
      <TableRow key={job.id}>
        <TableCell className="max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap">
          <span className="font-medium">{job.name}</span>
        </TableCell>
        <TableCell className="max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap">{job.databaseName}</TableCell>
        <TableCell className="max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap">
          {targetNames[job.backupTargetId] || job.backupTargetId}
        </TableCell>
        <TableCell className="max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap">
          <span className="font-mono text-xs">{job.schedule}</span>
        </TableCell>
        <TableCell>
          <Badge variant={job.enabled ? "success" : "secondary"}>{job.enabled ? "是" : "否"}</Badge>
        </TableCell>
        <TableCell className="whitespace-nowrap text-right">
          <div className="action-cell">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => onRun(job.id)}
              disabled={isSubmitting || isCurrentJobRunning}
            >
              <Play className={isCurrentJobRunning ? "size-4 animate-pulse" : "size-4"} />
              {isCurrentJobRunning ? "执行中" : "立即执行"}
            </Button>
            <IconButton icon="edit" label="编辑备份任务" disabled={isSubmitting} onClick={() => openEditDialog(job)} />
            <IconButton label="删除备份任务" disabled={isSubmitting} onClick={() => onDelete(job)} />
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <section className="panel">
      {activeRun && (
        <Card className="active-run-card" data-state={activeRun.status.toLowerCase()}>
          <CardHeader>
            <div className="active-run-heading">
              <div>
                <CardTitle>本次手动执行</CardTitle>
                <CardDescription>
                  {activeJobName || activeRun.backupJobId} · {formatDate(activeRun.startedAt)}
                </CardDescription>
              </div>
              <StatusBadge status={activeRun.status} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="active-run-grid">
              <div>
                <span>当前阶段</span>
                <strong>{stageLabel(activeRun.stage)}</strong>
              </div>
              <div>
                <span>耗时</span>
                <strong>{formatDuration(activeRun.durationMs) || runningDuration(activeRun)}</strong>
              </div>
              <div>
                <span>备份文件</span>
                <strong>{activeRun.archiveFileName || "生成中"}</strong>
              </div>
              <div>
                <span>远端路径</span>
                <strong>{activeRun.remotePath || "等待上传"}</strong>
              </div>
            </div>
            <DismissibleAlert message={activeRun.errorMessage || ""} />
            <div className="active-run-footer">
              <div className="active-run-log">
                <ListChecks className="size-4" />
                <span>{latestRunLogText(activeRunLogs)}</span>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => onViewRun(activeRun.id)}>
                查看完整日志
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {(!sources.length || !targets.length) && (
        <Alert>
          <div className="preflight-alert">
            <div>
              <div className="preflight-title">
                <AlertCircle className="size-4" />
                新建备份任务前需要完成基础配置
              </div>
              <p>
                {!sources.length && !targets.length
                  ? "请先创建数据源和备份目标。"
                  : !sources.length
                    ? "请先创建数据源。"
                    : "请先创建备份目标。"}
              </p>
            </div>
            <div className="preflight-actions">
              {!sources.length && (
                <Button type="button" variant="outline" size="sm" onClick={onGoToSources}>
                  去创建数据源
                </Button>
              )}
              {!targets.length && (
                <Button type="button" variant="outline" size="sm" onClick={onGoToTargets}>
                  去创建备份目标
                </Button>
              )}
            </div>
          </div>
        </Alert>
      )}
      <Card className="data-table-card job-group-card">
        <CardHeader className="data-table-header">
          <div className="min-w-0">
            <CardTitle>备份任务列表</CardTitle>
            <CardDescription>按数据源分组管理 Cron 计划，支持手动触发执行。</CardDescription>
          </div>
          <div className="shrink-0">
            {!sources.length || !targets.length ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" disabled>
                    新建备份任务
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {!sources.length && !targets.length ? "请先创建数据源和备份目标" : !sources.length ? "请先创建数据源" : "请先创建备份目标"}
                </TooltipContent>
              </Tooltip>
            ) : (
              <Button type="button" onClick={openCreateDialog} disabled={isSubmitting}>
                新建备份任务
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="data-table-content">
          {jobGroups.length ? (
            <Table className="job-group-table">
              <TableHeader className="sticky top-0 z-10 bg-muted/45">
                <TableRow>
                  <TableHead>数据源</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>连接地址</TableHead>
                  <TableHead>任务</TableHead>
                  <TableHead>启用</TableHead>
                  <TableHead>执行中</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobGroups.map((group) => {
                  const expanded = isGroupExpanded(group);

                  return (
                    <Fragment key={group.key}>
                      <TableRow className="job-source-row" key={`${group.key}-source`}>
                        <TableCell className="max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap">
                          <div className="job-source-cell">
                            <Button type="button" size="sm" variant="outline" onClick={() => toggleGroup(group)}>
                              {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                              {expanded ? "收起" : "展开"}
                            </Button>
                            <span className="font-medium">{sourceDisplayName(group)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{sourceType(group)}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap">
                          {sourceEndpoint(group)}
                        </TableCell>
                        <TableCell>{group.jobs.length} 个任务</TableCell>
                        <TableCell>{enabledJobCount(group)} 个启用</TableCell>
                        <TableCell>{runningJobCount(group)} 个执行中</TableCell>
                      </TableRow>
                      {expanded && (
                        <TableRow
                          aria-label={`${sourceDisplayName(group)}任务明细`}
                          className="job-child-row"
                          key={`${group.key}-jobs`}
                        >
                          <TableCell colSpan={6}>
                            {group.jobs.length ? (
                              <Table className="job-child-table">
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>名称</TableHead>
                                    <TableHead>数据库</TableHead>
                                    <TableHead>目标</TableHead>
                                    <TableHead>计划</TableHead>
                                    <TableHead>启用</TableHead>
                                    <TableHead className="text-right">操作</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>{group.jobs.map(renderJobRow)}</TableBody>
                              </Table>
                            ) : (
                              <EmptyState text="该数据源暂无备份任务" />
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <EmptyState text="暂无备份任务" />
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={resetDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{isEditing ? "编辑备份任务" : "新建备份任务"}</DialogTitle>
            <DialogDescription>选择数据源和目标后，可配置 Cron 计划并支持手动触发。</DialogDescription>
          </DialogHeader>
          <DismissibleAlert className="mb-4" message={globalError} />
          <ScrollArea className="max-h-[70vh]">
            <form
              className="form-grid"
              id="job-form"
              onSubmit={handleSubmit}
            >
              <Field label="任务名称">
                <Input name="name" placeholder="每日生产库备份" defaultValue={editingValue?.name || ""} required />
                {fieldErrors.name && <p className="field-error">{fieldErrors.name}</p>}
              </Field>
              <Field label="数据源">
                <Select
                  name="databaseConnectionId"
                  value={selectedSourceId}
                  onValueChange={handleSourceChange}
                  required
                >
                  <SelectTrigger aria-label="数据源">
                    <SelectValue placeholder="选择数据源" />
                  </SelectTrigger>
                  <SelectContent>
                    {sources.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="备份数据库">
                {databaseOptions.length > 0 && sources.find((source) => source.id === selectedSourceId)?.backupMode !== "manual" ? (
                  <Select
                    key={databaseOptions.join("\0")}
                    name="databaseName"
                    value={databaseName}
                    onValueChange={setDatabaseName}
                    required
                  >
                    <SelectTrigger aria-label="备份数据库" disabled={isLoadingDatabases}>
                      <SelectValue placeholder={isLoadingDatabases ? "正在加载数据库" : "选择数据库"} />
                    </SelectTrigger>
                    <SelectContent>
                      {databaseOptions.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    name="databaseName"
                    placeholder="业务库名"
                    value={databaseName}
                    onChange={(event) => setDatabaseName(event.target.value)}
                    disabled={isLoadingDatabases}
                    required
                  />
                )}
                {databaseLoadMessage && <p className="field-hint">{databaseLoadMessage}</p>}
                {fieldErrors.databaseName && <p className="field-error">{fieldErrors.databaseName}</p>}
              </Field>
              <Field label="备份目标">
                <Select name="backupTargetId" defaultValue={editingValue?.backupTargetId} required>
                  <SelectTrigger aria-label="备份目标">
                    <SelectValue placeholder="选择备份目标" />
                  </SelectTrigger>
                  <SelectContent>
                    {targets.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Cron 计划">
                <div className="cron-field">
                  <Select value={schedule} onValueChange={setSchedule}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择常用计划" />
                    </SelectTrigger>
                    <SelectContent>
                      {cronTemplates.map((template) => (
                        <SelectItem key={template.value} value={template.value}>
                          {template.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    name="schedule"
                    placeholder="0 0 2 * * *"
                    value={schedule}
                    onChange={(event) => setSchedule(event.target.value)}
                    required
                  />
                </div>
                {fieldErrors.schedule && <p className="field-error">{fieldErrors.schedule}</p>}
              </Field>
              <Field label="压缩方式">
                <Select name="compression" defaultValue={editingValue?.compression || "gzip"}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gzip">gzip</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="远端保留天数">
                <Input name="remoteRetentionDays" type="number" min="0" step="1" defaultValue={editingValue?.remoteRetentionDays ?? 30} required />
                {fieldErrors.remoteRetentionDays && <p className="field-error">{fieldErrors.remoteRetentionDays}</p>}
              </Field>
              <Field label="本地保留天数">
                <Input name="localRetentionDays" type="number" min="0" step="1" defaultValue={editingValue?.localRetentionDays ?? 7} required />
                {fieldErrors.localRetentionDays && <p className="field-error">{fieldErrors.localRetentionDays}</p>}
              </Field>
              <label className="checkbox-field">
                <Checkbox name="enabled" defaultChecked={editingValue?.enabled ?? true} />
                <span>启用任务</span>
              </label>
            </form>
          </ScrollArea>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                取消
              </Button>
            </DialogClose>
            <Button type="submit" form="job-form" disabled={isSubmitting}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
