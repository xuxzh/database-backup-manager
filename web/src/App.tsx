import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
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
import { AppShell } from "./app/AppShell";
import { tabMeta } from "./app/navigation";
import { LoginPage } from "./features/auth/LoginPage";
import { DashboardPanel } from "./features/dashboard/DashboardPanel";
import { SourcesPanel } from "./features/sources/SourcesPanel";
import { TargetsPanel } from "./features/targets/TargetsPanel";
import { JobsPanel } from "./features/jobs/JobsPanel";
import { RunsPanel } from "./features/runs/RunsPanel";
import { DeleteDialog, type DeleteTarget } from "./shared/components/DeleteDialog";
import { stringField, optionalStringField, numberField } from "./shared/utils/form";
import { errorMessage } from "./shared/utils/error";

type TabKey = "dashboard" | "sources" | "targets" | "jobs" | "runs";
type SubmitResult = Promise<boolean>;

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
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);

  const activeRun = useMemo(
    () => data.runs.find((run) => run.id === activeRunId) ?? null,
    [activeRunId, data.runs],
  );

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    setToken(null);
    setData(emptyData);
    setRunLogs([]);
    setActiveRunId(null);
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
    if (!token) return null;
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
      const nextData = { dashboard, sources, targets, jobs, runs };
      setData(nextData);
      return nextData;
    } catch (refreshError) {
      setError(errorMessage(refreshError));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [request, token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!token || !activeRunId) return;

    let timeoutId: number | undefined;
    let cancelled = false;

    async function pollRun() {
      try {
        const [dashboard, runs, logs] = await Promise.all([
          request<DashboardStats>("/dashboard"),
          request<BackupRun[]>("/runs"),
          request<BackupRunLog[]>(`/runs/${activeRunId}/logs`),
        ]);
        if (cancelled) return;

        setData((current) => ({ ...current, dashboard, runs }));
        setRunLogs(logs);

        const latestRun = runs.find((run) => run.id === activeRunId);
        if (latestRun && !isRunInProgress(latestRun)) {
          setNotice(latestRun.status === "Success" ? "备份已完成" : "备份执行失败，请查看运行日志");
          return;
        }
      } catch (pollError) {
        if (!cancelled) setError(errorMessage(pollError));
      }

      if (!cancelled) {
        timeoutId = window.setTimeout(pollRun, 2000);
      }
    }

    timeoutId = window.setTimeout(pollRun, 800);
    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [activeRunId, request, token]);

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

  async function handleCreateSource(event: FormEvent<HTMLFormElement>): SubmitResult {
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
    const ok = await submitForm(event.currentTarget, () =>
      request<DatabaseConnection>("/sources", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
    if (ok) setNotice("数据源已保存");
    return ok;
  }

  async function handleCreateTarget(event: FormEvent<HTMLFormElement>): SubmitResult {
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
    const ok = await submitForm(event.currentTarget, () =>
      request<BackupTarget>("/targets", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
    if (ok) setNotice("备份目标已保存");
    return ok;
  }

  async function handleCreateJob(event: FormEvent<HTMLFormElement>): SubmitResult {
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
    const ok = await submitForm(event.currentTarget, () =>
      request<BackupJob>("/jobs", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
    if (ok) setNotice("备份任务已保存");
    return ok;
  }

  async function submitForm(form: HTMLFormElement, action: () => Promise<unknown>) {
    setIsSubmitting(true);
    setError("");
    setNotice("");
    try {
      await action();
      form.reset();
      await refresh();
      return true;
    } catch (submitError) {
      setError(errorMessage(submitError));
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function runJob(jobId: string) {
    setIsSubmitting(true);
    setError("");
    setNotice("");
    try {
      const run = await request<BackupRun>(`/jobs/${jobId}/run`, { method: "POST" });
      setActiveRunId(run.id);
      setSelectedRunId(run.id);
      setRunLogs([]);
      setData((current) => ({
        ...current,
        runs: [run, ...current.runs.filter((item) => item.id !== run.id)],
      }));
      setNotice("任务已提交，正在等待执行结果");
      const refreshed = await refresh();
      const latestRun = refreshed?.runs.find((item) => item.id === run.id);
      if (latestRun && !isRunInProgress(latestRun)) {
        setNotice(latestRun.status === "Success" ? "备份已完成" : "备份执行失败，请查看运行日志");
        setRunLogs(await request<BackupRunLog[]>(`/runs/${run.id}/logs`));
      }
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
    <AppShell
      activeTab={activeTab}
      isLoading={isLoading}
      notice={notice}
      error={error}
      onTabChange={(tab) => setActiveTab(tab as TabKey)}
      onLogout={logout}
      onRefresh={refresh}
    >
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
          activeRun={activeRun}
          activeRunLogs={selectedRunId === activeRunId ? runLogs : []}
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
          onViewRun={(runId) => {
            setActiveTab("runs");
            loadRunLogs(runId);
          }}
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

      <DeleteDialog
        isSubmitting={isSubmitting}
        target={deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteItem(deleteTarget)}
      />
    </AppShell>
  );
}

function isRunInProgress(run: BackupRun | null) {
  return run?.status === "Pending" || run?.status === "Running";
}

export default App;