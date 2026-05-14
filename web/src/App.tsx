import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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

const tabMeta: Record<TabKey, { title: string; hint: string }> = {
  dashboard: { title: "仪表盘", hint: "查看备份任务和最近运行状态" },
  sources: { title: "数据源", hint: "配置 MySQL 和 PostgreSQL 连接" },
  targets: { title: "备份目标", hint: "配置 SSH 远端备份服务器" },
  jobs: { title: "备份任务", hint: "配置周期任务并手动触发备份" },
  runs: { title: "运行记录", hint: "查看执行结果和阶段日志" },
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
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">备</span>
          <div>
            <h1>数据库备份管理台</h1>
            <p>Backup Manager</p>
          </div>
        </div>
        <nav aria-label="主导航">
          {tabs.map((tab) => (
            <button
              className={tab.key === activeTab ? "active" : ""}
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <button className="ghost-button" type="button" onClick={logout}>
          退出登录
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h2>{tabMeta[activeTab].title}</h2>
            <p>{tabMeta[activeTab].hint}</p>
          </div>
          <button type="button" onClick={refresh} disabled={isLoading}>
            {isLoading ? "刷新中..." : "刷新"}
          </button>
        </header>

        {(notice || error) && (
          <div className={error ? "message error" : "message success"}>{error || notice}</div>
        )}

        {activeTab === "dashboard" && <DashboardPanel dashboard={data.dashboard} />}
        {activeTab === "sources" && (
          <SourcesPanel
            isSubmitting={isSubmitting}
            items={data.sources}
            onSubmit={handleCreateSource}
          />
        )}
        {activeTab === "targets" && (
          <TargetsPanel
            isSubmitting={isSubmitting}
            items={data.targets}
            onSubmit={handleCreateTarget}
          />
        )}
        {activeTab === "jobs" && (
          <JobsPanel
            isSubmitting={isSubmitting}
            jobs={data.jobs}
            sources={data.sources}
            targets={data.targets}
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
    </main>
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
      <section className="login-panel">
        <h1>数据库备份管理台</h1>
        <p>登录后管理数据源、备份目标和定时任务。</p>
        <form onSubmit={onSubmit}>
          <label>
            用户名
            <input name="username" autoComplete="username" defaultValue="admin" required />
          </label>
          <label>
            密码
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              defaultValue="admin123"
              required
            />
          </label>
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "登录中..." : "登录"}
          </button>
        </form>
        {error && <p className="form-error">{error}</p>}
      </section>
    </main>
  );
}

function DashboardPanel({ dashboard }: { dashboard: DashboardStats | null }) {
  const stats = [
    { label: "数据源", value: dashboard?.sourceCount ?? 0 },
    { label: "备份目标", value: dashboard?.targetCount ?? 0 },
    { label: "任务", value: dashboard?.jobCount ?? 0 },
    { label: "启用任务", value: dashboard?.enabledJobCount ?? 0 },
    { label: "今日成功", value: dashboard?.todaySuccessCount ?? 0 },
    { label: "今日失败", value: dashboard?.todayFailedCount ?? 0 },
  ];

  return (
    <section className="panel">
      <div className="stats-grid">
        {stats.map((item) => (
          <article className="stat-card" key={item.label}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </article>
        ))}
      </div>
      <section className="detail-block">
        <h3>最近运行</h3>
        {dashboard?.latestRun ? (
          <RunSummary run={dashboard.latestRun} />
        ) : (
          <EmptyState text="暂无运行记录" />
        )}
      </section>
    </section>
  );
}

function SourcesPanel({
  isSubmitting,
  items,
  onSubmit,
}: {
  isSubmitting: boolean;
  items: DatabaseConnection[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="panel">
      <form className="form-grid" onSubmit={onSubmit}>
        <input name="name" placeholder="数据源名称" required />
        <select name="dbType" defaultValue="mysql">
          <option value="mysql">MySQL</option>
          <option value="postgres">PostgreSQL</option>
        </select>
        <input name="host" placeholder="主机" required />
        <input name="port" type="number" defaultValue="3306" required />
        <input name="username" placeholder="用户名" required />
        <input
          name="password"
          type="password"
          placeholder="密码"
          autoComplete="new-password"
          required
        />
        <input name="databaseName" placeholder="默认数据库" />
        <button type="submit" disabled={isSubmitting}>
          新增数据源
        </button>
      </form>
      <DataTable
        emptyText="暂无数据源"
        headers={["名称", "类型", "主机", "端口", "用户", "默认数据库"]}
        rows={items.map((item) => [
          item.name,
          item.dbType,
          item.host,
          String(item.port),
          item.username,
          item.databaseName || "",
        ])}
      />
    </section>
  );
}

function TargetsPanel({
  isSubmitting,
  items,
  onSubmit,
}: {
  isSubmitting: boolean;
  items: BackupTarget[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="panel">
      <form className="form-grid" onSubmit={onSubmit}>
        <input name="name" placeholder="目标名称" required />
        <input name="host" placeholder="SSH 主机" required />
        <input name="port" type="number" defaultValue="22" required />
        <input name="username" placeholder="SSH 用户名" required />
        <select name="authMethod" defaultValue="key">
          <option value="key">SSH Key</option>
          <option value="password">密码</option>
        </select>
        <input
          name="secret"
          type="password"
          placeholder="私钥或密码"
          autoComplete="new-password"
          required
        />
        <input name="baseDir" placeholder="远端基础目录" defaultValue="/data/backups" required />
        <button type="submit" disabled={isSubmitting}>
          新增目标
        </button>
      </form>
      <DataTable
        emptyText="暂无备份目标"
        headers={["名称", "类型", "主机", "端口", "用户", "远端目录"]}
        rows={items.map((item) => [
          item.name,
          item.targetType,
          item.host,
          String(item.port),
          item.username,
          item.baseDir,
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
  onRun,
  onSubmit,
}: {
  isSubmitting: boolean;
  jobs: BackupJob[];
  sources: DatabaseConnection[];
  targets: BackupTarget[];
  onRun: (jobId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const sourceNames = useMemo(() => mapNames(sources), [sources]);
  const targetNames = useMemo(() => mapNames(targets), [targets]);

  return (
    <section className="panel">
      <form className="form-grid" onSubmit={onSubmit}>
        <input name="name" placeholder="任务名称" required />
        <select name="databaseConnectionId" required>
          <option value="">选择数据源</option>
          {sources.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <input name="databaseName" placeholder="备份数据库" required />
        <select name="backupTargetId" required>
          <option value="">选择备份目标</option>
          {targets.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <input name="schedule" placeholder="Cron，例如 0 0 2 * * *" defaultValue="0 0 2 * * *" required />
        <select name="compression" defaultValue="gzip">
          <option value="gzip">gzip</option>
        </select>
        <input name="remoteRetentionDays" type="number" defaultValue="30" required />
        <input name="localRetentionDays" type="number" defaultValue="7" required />
        <label className="checkbox-field">
          <input name="enabled" type="checkbox" defaultChecked />
          启用
        </label>
        <button type="submit" disabled={isSubmitting || !sources.length || !targets.length}>
          新增任务
        </button>
      </form>
      <div className="table-wrap">
        {jobs.length ? (
          <table>
            <thead>
              <tr>
                {["名称", "数据源", "数据库", "目标", "计划", "启用", "操作"].map((header) => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>{job.name}</td>
                  <td>{sourceNames[job.databaseConnectionId] || job.databaseConnectionId}</td>
                  <td>{job.databaseName}</td>
                  <td>{targetNames[job.backupTargetId] || job.backupTargetId}</td>
                  <td>{job.schedule}</td>
                  <td>{job.enabled ? "是" : "否"}</td>
                  <td>
                    <button type="button" onClick={() => onRun(job.id)} disabled={isSubmitting}>
                      立即执行
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState text="暂无备份任务" />
        )}
      </div>
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
      <div className="table-wrap">
        {runs.length ? (
          <table>
            <thead>
              <tr>
                {["任务", "状态", "阶段", "开始时间", "结束时间", "错误", "日志"].map((header) => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>{jobNames[run.backupJobId] || run.backupJobId}</td>
                  <td>
                    <StatusBadge status={run.status} />
                  </td>
                  <td>{run.stage}</td>
                  <td>{formatDate(run.startedAt)}</td>
                  <td>{formatDate(run.finishedAt)}</td>
                  <td className="error-cell">{run.errorMessage || ""}</td>
                  <td>
                    <button
                      type="button"
                      className={selectedRunId === run.id ? "secondary active" : "secondary"}
                      onClick={() => onLoadLogs(run.id)}
                    >
                      查看
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState text="暂无运行记录" />
        )}
      </div>
      <section className="detail-block">
        <h3>运行日志</h3>
        {logs.length ? (
          <pre className="log-viewer">
            {logs
              .map((log) => `[${formatDate(log.timestamp)}] ${log.level} ${log.stage}: ${log.message}`)
              .join("\n")}
          </pre>
        ) : (
          <EmptyState text="选择一条运行记录查看日志" />
        )}
      </section>
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
  rows: string[][];
}) {
  return (
    <div className="table-wrap">
      {rows.length ? (
        <table>
          <thead>
            <tr>
              {headers.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.join("-") || rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={`${cell}-${cellIndex}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState text={emptyText} />
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="empty-state">{text}</p>;
}

function StatusBadge({ status }: { status: BackupRun["status"] }) {
  return <span className={`status status-${status.toLowerCase()}`}>{status}</span>;
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
