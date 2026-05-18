import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { BackupJob, BackupRun, BackupRunLog, DatabaseConnection, BackupTarget } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertCircle, ListChecks, Play } from "lucide-react";
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
import { DataTable } from "@/shared/components/DataTable";
import { Field } from "@/shared/components/Field";
import { StatusBadge } from "@/shared/components/StatusBadge";
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
  onRun: (jobId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>, job: BackupJob | null) => SubmitResult;
  onViewRun: (runId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<BackupJob | null>(null);
  const [schedule, setSchedule] = useState(cronTemplates[0].value);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState("");
  const sourceNames = useMemo(() => mapNames(sources), [sources]);
  const targetNames = useMemo(() => mapNames(targets), [targets]);
  const activeJobName = activeRun ? jobs.find((job) => job.id === activeRun.backupJobId)?.name : null;

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
      setFieldErrors({});
      setGlobalError("");
    }
  }

  function openCreateDialog() {
    setEditingJob(null);
    setSchedule(cronTemplates[0].value);
    setFieldErrors({});
    setGlobalError("");
    setOpen(true);
  }

  function openEditDialog(job: BackupJob) {
    setEditingJob(job);
    setSchedule(job.schedule);
    setFieldErrors({});
    setGlobalError("");
    setOpen(true);
  }

  const editingValue = editingJob ? jobToFormValue(editingJob) : null;
  const isEditing = Boolean(editingJob);

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
            {activeRun.errorMessage && <Alert variant="destructive">{activeRun.errorMessage}</Alert>}
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
      <DataTable
        emptyText="暂无备份任务"
        title="备份任务列表"
        description="配置 Cron 计划，支持手动触发执行。"
        action={
          !sources.length || !targets.length ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" disabled>
                  新建备份任务
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                { !sources.length && !targets.length ? "请先创建数据源和备份目标" : !sources.length ? "请先创建数据源" : "请先创建备份目标" }
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button type="button" onClick={openCreateDialog} disabled={isSubmitting}>
              新建备份任务
            </Button>
          )
        }
        headers={["名称", "数据源", "数据库", "目标", "计划", "启用", "操作"]}
        rows={jobs.map((job) => {
          const isCurrentJobRunning = activeRun?.backupJobId === job.id && isRunInProgress(activeRun);
          return {
            key: job.id,
            cells: [
              <span className="font-medium">{job.name}</span>,
              sourceNames[job.databaseConnectionId] || job.databaseConnectionId,
              job.databaseName,
              targetNames[job.backupTargetId] || job.backupTargetId,
              <span className="font-mono text-xs">{job.schedule}</span>,
              <Badge variant={job.enabled ? "success" : "secondary"}>{job.enabled ? "是" : "否"}</Badge>,
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
              </div>,
            ],
          };
        })}
      />

      <Dialog open={open} onOpenChange={resetDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{isEditing ? "编辑备份任务" : "新建备份任务"}</DialogTitle>
            <DialogDescription>选择数据源和目标后，可配置 Cron 计划并支持手动触发。</DialogDescription>
          </DialogHeader>
          {globalError && (
            <Alert className="mb-4" variant="destructive">{globalError}</Alert>
          )}
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
                <Select name="databaseConnectionId" defaultValue={editingValue?.databaseConnectionId} required>
                  <SelectTrigger>
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
                <Input name="databaseName" placeholder="业务库名" defaultValue={editingValue?.databaseName || ""} required />
                {fieldErrors.databaseName && <p className="field-error">{fieldErrors.databaseName}</p>}
              </Field>
              <Field label="备份目标">
                <Select name="backupTargetId" defaultValue={editingValue?.backupTargetId} required>
                  <SelectTrigger>
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
