import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  CalendarClock,
  Database,
  HardDrive,
  History,
  LogOut,
  Play,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ApiError, apiRequest } from "./api/client";
import type {
  BackupJob,
  BackupRun,
  BackupRunLog,
  BackupTarget,
  DashboardStats,
  DatabaseConnection,
  UpsertBackupJob,
  UpsertBackupTarget,
  UpsertDatabaseConnection,
} from "./types/api";

type TabKey = "dashboard" | "sources" | "targets" | "jobs" | "runs";
type DeleteTarget = { label: string; path: string; successMessage: string } | null;

type AppData = {
  dashboard: DashboardStats | null;
  sources: DatabaseConnection[];
  targets: BackupTarget[];
  jobs: BackupJob[];
  runs: BackupRun[];
};

const emptyData: AppData = {
  dashboard: null,
  sources: [],
  targets: [],
  jobs: [],
  runs: [],
};

const tabMeta: Record<TabKey, { title: string; hint: string; icon: ReactNode }> = {
  dashboard: { title: "仪表盘", hint: "查看备份任务和最近运行状态", icon: <ShieldCheck /> },
  sources: { title: "数据源", hint: "配置 MySQL 和 PostgreSQL 连接", icon: <Database /> },
  targets: { title: "备份目标", hint: "配置 SSH 远端备份服务器", icon: <HardDrive /> },
  jobs: { title: "备份任务", hint: "配置周期任务并手动触发备份", icon: <CalendarClock /> },
  runs: { title: "运行记录", hint: "查看执行结果和阶段日志", icon: <History /> },
};

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "dashboard", label: "仪表盘" },
  { key: "sources", label: "数据源" },
  { key: "targets", label: "备份目标" },
  { key: "jobs", label: "备份任务" },
  { key: "runs", label: "运行记录" },
];

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [data, setData] = useState<AppData>(emptyData);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [runLogs, setRunLogs] = useState<BackupRunLog[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    setToken(null);
    setData(emptyData);
    setRunLogs([]);
    setSelectedRunId(null);
  }, []);

  const request = useCallback(
    async <T,>(path: string, options: RequestInit = {}) => {
      try {
        return await apiRequest<T>(path, { ...options, token });
      } catch (requestError) {
        if (requestError instanceof ApiError && requestError.status === 401) {
          logout();
        }
        throw requestError;
      }
    },
    [logout, token],
  );

  const refresh = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError("");
    try {
      const [dashboard, sources, targets, jobs, runs] = await Promise.all([
        request<DashboardStats>("/dashboard"),
        request<DatabaseConnection[]>("/sources"),
        request<BackupTarget[]>("/targets"),
        request<BackupJob[]>("/jobs"),
        request<BackupRun[]>("/runs"),
      ]);
      setData({ dashboard, sources, targets, jobs, runs });
    } catch (refreshError) {
      setError(errorMessage(refreshError));
    } finally {
      setIsLoading(false);
    }
  }, [request, token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError("");
    setIsSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await apiRequest<{ token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: stringField(form, "username"),
          password: stringField(form, "password"),
        }),
      });
      localStorage.setItem("token", response.token);
      setToken(response.token);
      setNotice("登录成功");
    } catch (loginErrorValue) {
      setLoginError(errorMessage(loginErrorValue));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload: UpsertDatabaseConnection = {
      name: stringField(form, "name"),
      dbType: stringField(form, "dbType"),
      host: stringField(form, "host"),
      port: numberField(form, "port"),
      username: stringField(form, "username"),
      password: stringField(form, "password"),
      databaseName: optionalStringField(form, "databaseName"),
      configJson: {},
    };
    await submitForm(event.currentTarget, () =>
      request<DatabaseConnection>("/sources", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
    setNotice("数据源已保存");
  }

  async function handleCreateTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload: UpsertBackupTarget = {
      name: stringField(form, "name"),
      targetType: "ssh",
      host: stringField(form, "host"),
      port: numberField(form, "port"),
      username: stringField(form, "username"),
      authMethod: stringField(form, "authMethod"),
      secret: stringField(form, "secret"),
      baseDir: stringField(form, "baseDir"),
      configJson: {},
    };
    await submitForm(event.currentTarget, () =>
      request<BackupTarget>("/targets", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
    setNotice("备份目标已保存");
  }

  async function handleCreateJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload: UpsertBackupJob = {
      name: stringField(form, "name"),
      databaseConnectionId: stringField(form, "databaseConnectionId"),
      databaseName: stringField(form, "databaseName"),
      backupTargetId: stringField(form, "backupTargetId"),
      schedule: stringField(form, "schedule"),
      compression: stringField(form, "compression"),
      remoteRetentionDays: numberField(form, "remoteRetentionDays"),
      localRetentionDays: numberField(form, "localRetentionDays"),
      enabled: form.get("enabled") === "on",
    };
    await submitForm(event.currentTarget, () =>
      request<BackupJob>("/jobs", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
    setNotice("备份任务已保存");
  }

  async function submitForm(form: HTMLFormElement, action: () => Promise<unknown>) {
    setIsSubmitting(true);
    setError("");
    setNotice("");
    try {
      await action();
      form.reset();
      await refresh();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function runJob(jobId: string) {
    setIsSubmitting(true);
    setError("");
    setNotice("");
    try {
      await request<BackupRun>(`/jobs/${jobId}/run`, { method: "POST" });
      setNotice("任务已提交执行");
      await refresh();
    } catch (runError) {
      setError(errorMessage(runError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteItem(target: NonNullable<DeleteTarget>) {
    setIsSubmitting(true);
    setError("");
    setNotice("");
    try {
      await request<void>(target.path, { method: "DELETE" });
      setNotice(target.successMessage);
      setDeleteTarget(null);
      await refresh();
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function loadRunLogs(runId: string) {
    setError("");
    setSelectedRunId(runId);
    try {
      setRunLogs(await request<BackupRunLog[]>(`/runs/${runId}/logs`));
    } catch (logsError) {
      setError(errorMessage(logsError));
    }
  }

  if (!token) {
    return <LoginPage error={loginError} isSubmitting={isSubmitting} onSubmit={handleLogin} />;
  }

  return (
    <TooltipProvider>
      <main className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">
              <Server className="size-5" />
            </div>
            <div>
              <h1>数据库备份管理台</h1>
              <p>Backup Manager</p>
            </div>
          </div>
          <nav aria-label="主导航">
            {tabs.map((tab) => (
              <Button
                className="nav-button"
                data-active={tab.key === activeTab}
                key={tab.key}
                type="button"
                variant="ghost"
                onClick={() => setActiveTab(tab.key)}
              >
                <span className="nav-icon">{tabMeta[tab.key].icon}</span>
                {tab.label}
              </Button>
            ))}
          </nav>
          <Separator className="bg-sidebar-border" />
          <Button className="logout-button" type="button" variant="ghost" onClick={logout}>
            <LogOut className="size-4" />
            退出登录
          </Button>
        </aside>

        <section className="workspace">
          <header className="topbar">
            <div>
              <div className="eyebrow">
                <span className="topbar-icon">{tabMeta[activeTab].icon}</span>
                自部署备份控制台
              </div>
              <h2>{tabMeta[activeTab].title}</h2>
              <p>{tabMeta[activeTab].hint}</p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="outline" onClick={refresh} disabled={isLoading}>
                  <RefreshCw className={isLoading ? "size-4 animate-spin" : "size-4"} />
                  {isLoading ? "刷新中" : "刷新"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>重新加载数据源、任务和运行记录</TooltipContent>
            </Tooltip>
          </header>

          {(notice || error) && (
            <Alert className="mb-4" variant={error ? "destructive" : "success"}>
              {error || notice}
            </Alert>
          )}

          {activeTab === "dashboard" && <DashboardPanel dashboard={data.dashboard} />}
          {activeTab === "sources" && (
            <SourcesPanel
              isSubmitting={isSubmitting}
              items={data.sources}
              onDelete={(source) =>
                setDeleteTarget({
                  label: `数据源「${source.name}」`,
                  path: `/sources/${source.id}`,
                  successMessage: "数据源已删除",
                })
              }
              onSubmit={handleCreateSource}
            />
          )}
          {activeTab === "targets" && (
            <TargetsPanel
              isSubmitting={isSubmitting}
              items={data.targets}
              onDelete={(target) =>
                setDeleteTarget({
                  label: `备份目标「${target.name}」`,
                  path: `/targets/${target.id}`,
                  successMessage: "备份目标已删除",
                })
              }
              onSubmit={handleCreateTarget}
            />
          )}
          {activeTab === "jobs" && (
            <JobsPanel
              isSubmitting={isSubmitting}
              jobs={data.jobs}
              sources={data.sources}
              targets={data.targets}
              onDelete={(job) =>
                setDeleteTarget({
                  label: `备份任务「${job.name}」`,
                  path: `/jobs/${job.id}`,
                  successMessage: "备份任务已删除",
                })
              }
              onRun={runJob}
              onSubmit={handleCreateJob}
            />
          )}
          {activeTab === "runs" && (
            <RunsPanel
              jobs={data.jobs}
              logs={runLogs}
              runs={data.runs}
              selectedRunId={selectedRunId}
              onLoadLogs={loadRunLogs}
            />
          )}
        </section>

        <DeleteDialog
          isSubmitting={isSubmitting}
          target={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteTarget && deleteItem(deleteTarget)}
        />
      </main>
    </TooltipProvider>
  );
}

function LoginPage({
  error,
  isSubmitting,
  onSubmit,
}: {
  error: string;
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="login-page">
      <Card className="login-panel">
        <CardHeader>
          <div className="login-mark">
            <ShieldCheck className="size-6" />
          </div>
          <CardTitle className="text-2xl">数据库备份管理台</CardTitle>
          <CardDescription>登录后管理数据源、备份目标和定时任务。</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="stack-form" onSubmit={onSubmit}>
            <Field label="用户名">
              <Input name="username" autoComplete="username" defaultValue="admin" required />
            </Field>
            <Field label="密码">
              <Input
                name="password"
                type="password"
                autoComplete="current-password"
                defaultValue="admin123"
                required
              />
            </Field>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "登录中..." : "登录"}
            </Button>
          </form>
          {error && (
            <Alert className="mt-4" variant="destructive">
              {error}
            </Alert>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function DashboardPanel({ dashboard }: { dashboard: DashboardStats | null }) {
  const stats = [
    { label: "数据源", value: dashboard?.sourceCount ?? 0, icon: <Database />, tone: "sky" },
    { label: "备份目标", value: dashboard?.targetCount ?? 0, icon: <HardDrive />, tone: "indigo" },
    { label: "任务", value: dashboard?.jobCount ?? 0, icon: <CalendarClock />, tone: "slate" },
    { label: "启用任务", value: dashboard?.enabledJobCount ?? 0, icon: <ShieldCheck />, tone: "emerald" },
    { label: "今日成功", value: dashboard?.todaySuccessCount ?? 0, icon: <ShieldCheck />, tone: "emerald" },
    { label: "今日失败", value: dashboard?.todayFailedCount ?? 0, icon: <History />, tone: "rose" },
  ];

  return (
    <section className="panel">
      <div className="stats-grid">
        {stats.map((item) => (
          <Card className="stat-card" data-tone={item.tone} key={item.label}>
            <CardContent className="p-4">
              <div className="stat-icon">{item.icon}</div>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>最近运行</CardTitle>
          <CardDescription>最近一次备份执行的状态和阶段</CardDescription>
        </CardHeader>
        <CardContent>
          {dashboard?.latestRun ? <RunSummary run={dashboard.latestRun} /> : <EmptyState text="暂无运行记录" />}
        </CardContent>
      </Card>
    </section>
  );
}

function SourcesPanel({
  isSubmitting,
  items,
  onDelete,
  onSubmit,
}: {
  isSubmitting: boolean;
  items: DatabaseConnection[];
  onDelete: (source: DatabaseConnection) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="panel">
      <Card>
        <CardHeader>
          <CardTitle>新增数据源</CardTitle>
          <CardDescription>数据库密码会由后端加密保存。</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="form-grid" onSubmit={onSubmit}>
            <Field label="名称">
              <Input name="name" placeholder="生产库" required />
            </Field>
            <Field label="类型">
              <Select name="dbType" defaultValue="mysql">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mysql">MySQL</SelectItem>
                  <SelectItem value="postgres">PostgreSQL</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="主机">
              <Input name="host" placeholder="127.0.0.1" required />
            </Field>
            <Field label="端口">
              <Input name="port" type="number" defaultValue="3306" required />
            </Field>
            <Field label="用户名">
              <Input name="username" placeholder="backup" required />
            </Field>
            <Field label="密码">
              <Input name="password" type="password" placeholder="数据库密码" autoComplete="new-password" required />
            </Field>
            <Field label="默认数据库">
              <Input name="databaseName" placeholder="可选" />
            </Field>
            <div className="form-actions">
              <Button type="submit" disabled={isSubmitting}>
                新增数据源
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <DataTable
        emptyText="暂无数据源"
        headers={["名称", "类型", "主机", "端口", "用户", "默认数据库", "操作"]}
        rows={items.map((item) => [
          item.name,
          <Badge variant="secondary">{item.dbType}</Badge>,
          item.host,
          String(item.port),
          item.username,
          item.databaseName || "未设置",
          <IconButton label="删除数据源" disabled={isSubmitting} onClick={() => onDelete(item)} />,
        ])}
      />
    </section>
  );
}

function TargetsPanel({
  isSubmitting,
  items,
  onDelete,
  onSubmit,
}: {
  isSubmitting: boolean;
  items: BackupTarget[];
  onDelete: (target: BackupTarget) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="panel">
      <Card>
        <CardHeader>
          <CardTitle>新增备份目标</CardTitle>
          <CardDescription>当前支持 SSH 远端目标，可使用密钥或密码认证。</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="form-grid" onSubmit={onSubmit}>
            <Field label="名称">
              <Input name="name" placeholder="远端备份机" required />
            </Field>
            <Field label="SSH 主机">
              <Input name="host" placeholder="10.0.0.8" required />
            </Field>
            <Field label="端口">
              <Input name="port" type="number" defaultValue="22" required />
            </Field>
            <Field label="SSH 用户名">
              <Input name="username" placeholder="backup" required />
            </Field>
            <Field label="认证方式">
              <Select name="authMethod" defaultValue="key">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="key">SSH Key</SelectItem>
                  <SelectItem value="password">密码</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="密钥或密码">
              <Input name="secret" type="password" placeholder="私钥或密码" autoComplete="new-password" required />
            </Field>
            <Field label="远端目录">
              <Input name="baseDir" placeholder="/data/backups" defaultValue="/data/backups" required />
            </Field>
            <div className="form-actions">
              <Button type="submit" disabled={isSubmitting}>
                新增目标
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <DataTable
        emptyText="暂无备份目标"
        headers={["名称", "类型", "主机", "端口", "用户", "远端目录", "操作"]}
        rows={items.map((item) => [
          item.name,
          <Badge variant="secondary">{item.targetType}</Badge>,
          item.host,
          String(item.port),
          item.username,
          item.baseDir,
          <IconButton label="删除备份目标" disabled={isSubmitting} onClick={() => onDelete(item)} />,
        ])}
      />
    </section>
  );
}

function JobsPanel({
  isSubmitting,
  jobs,
  sources,
  targets,
  onDelete,
  onRun,
  onSubmit,
}: {
  isSubmitting: boolean;
  jobs: BackupJob[];
  sources: DatabaseConnection[];
  targets: BackupTarget[];
  onDelete: (job: BackupJob) => void;
  onRun: (jobId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const sourceNames = useMemo(() => mapNames(sources), [sources]);
  const targetNames = useMemo(() => mapNames(targets), [targets]);

  return (
    <section className="panel">
      <Card>
        <CardHeader>
          <CardTitle>新增备份任务</CardTitle>
          <CardDescription>选择数据源和目标后，可配置 Cron 计划并支持手动触发。</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="form-grid" onSubmit={onSubmit}>
            <Field label="任务名称">
              <Input name="name" placeholder="每日生产库备份" required />
            </Field>
            <Field label="数据源">
              <Select name="databaseConnectionId" required>
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
              <Input name="databaseName" placeholder="业务库名" required />
            </Field>
            <Field label="备份目标">
              <Select name="backupTargetId" required>
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
              <Input name="schedule" placeholder="0 0 2 * * *" defaultValue="0 0 2 * * *" required />
            </Field>
            <Field label="压缩方式">
              <Select name="compression" defaultValue="gzip">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gzip">gzip</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="远端保留天数">
              <Input name="remoteRetentionDays" type="number" defaultValue="30" required />
            </Field>
            <Field label="本地保留天数">
              <Input name="localRetentionDays" type="number" defaultValue="7" required />
            </Field>
            <label className="checkbox-field">
              <Checkbox name="enabled" defaultChecked />
              <span>启用任务</span>
            </label>
            <div className="form-actions">
              <Button type="submit" disabled={isSubmitting || !sources.length || !targets.length}>
                新增任务
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          {jobs.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  {["名称", "数据源", "数据库", "目标", "计划", "启用", "操作"].map((header) => (
                    <TableHead key={header}>{header}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-medium">{job.name}</TableCell>
                    <TableCell>{sourceNames[job.databaseConnectionId] || job.databaseConnectionId}</TableCell>
                    <TableCell>{job.databaseName}</TableCell>
                    <TableCell>{targetNames[job.backupTargetId] || job.backupTargetId}</TableCell>
                    <TableCell className="font-mono text-xs">{job.schedule}</TableCell>
                    <TableCell>
                      <Badge variant={job.enabled ? "success" : "secondary"}>{job.enabled ? "是" : "否"}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="action-cell">
                        <Button type="button" size="sm" variant="secondary" onClick={() => onRun(job.id)} disabled={isSubmitting}>
                          <Play className="size-4" />
                          立即执行
                        </Button>
                        <IconButton label="删除备份任务" disabled={isSubmitting} onClick={() => onDelete(job)} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState text="暂无备份任务" />
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function RunsPanel({
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
      <Card>
        <CardContent className="p-0">
          {runs.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  {["任务", "状态", "阶段", "开始时间", "结束时间", "错误", "日志"].map((header) => (
                    <TableHead key={header}>{header}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id} data-state={selectedRunId === run.id ? "selected" : undefined}>
                    <TableCell className="font-medium">{jobNames[run.backupJobId] || run.backupJobId}</TableCell>
                    <TableCell>
                      <StatusBadge status={run.status} />
                    </TableCell>
                    <TableCell>{run.stage}</TableCell>
                    <TableCell>{formatDate(run.startedAt)}</TableCell>
                    <TableCell>{formatDate(run.finishedAt)}</TableCell>
                    <TableCell className="error-cell">{run.errorMessage || ""}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant={selectedRunId === run.id ? "default" : "outline"}
                        onClick={() => onLoadLogs(run.id)}
                      >
                        查看
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState text="暂无运行记录" />
          )}
        </CardContent>
      </Card>
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

function RunSummary({ run }: { run: BackupRun }) {
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

function DataTable({
  emptyText,
  headers,
  rows,
}: {
  emptyText: string;
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <Card>
      <CardContent className="p-0">
        {rows.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                {headers.map((header) => (
                  <TableHead key={header}>{header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <TableCell key={cellIndex}>{cell}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState text={emptyText} />
        )}
      </CardContent>
    </Card>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="field">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="empty-state">{text}</p>;
}

function IconButton({
  disabled,
  label,
  onClick,
}: {
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" size="icon" variant="outline" disabled={disabled} onClick={onClick} aria-label={label}>
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function DeleteDialog({
  isSubmitting,
  target,
  onCancel,
  onConfirm,
}: {
  isSubmitting: boolean;
  target: DeleteTarget;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认删除</DialogTitle>
          <DialogDescription>
            删除 {target?.label} 后将无法在列表中继续使用，请确认相关任务或运行记录不再依赖它。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isSubmitting}>
              取消
            </Button>
          </DialogClose>
          <Button type="button" variant="destructive" disabled={isSubmitting} onClick={onConfirm}>
            删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: BackupRun["status"] }) {
  const normalized = status.toLowerCase();
  if (normalized === "success") return <Badge variant="success">{status}</Badge>;
  if (normalized === "failed") return <Badge variant="destructive">{status}</Badge>;
  if (normalized === "running") return <Badge variant="info">{status}</Badge>;
  return <Badge variant="warning">{status}</Badge>;
}

function mapNames(items: Array<{ id: string; name: string }>) {
  return Object.fromEntries(items.map((item) => [item.id, item.name]));
}

function stringField(form: FormData, name: string) {
  return String(form.get(name) || "").trim();
}

function optionalStringField(form: FormData, name: string) {
  const value = stringField(form, name);
  return value || undefined;
}

function numberField(form: FormData, name: string) {
  return Number(form.get(name));
}

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "medium",
    hour12: false,
  }).format(date);
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "操作失败";
}

export default App;
