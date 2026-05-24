import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  RouterProvider,
  createRoute,
  createRouter,
  createRootRoute,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import type { BackupJob, BackupRun, BackupRunLog, BackupTarget, DashboardStats, DatabaseConnection, PublicAppConfig, SourceDatabasesResult, TestDatabaseConnectionResult } from "./types/api";
import { AppShell } from "./app/AppShell";
import { LoginPage } from "./features/auth/LoginPage";
import { DashboardPanel } from "./features/dashboard/DashboardPanel";
import { SourcesPanel } from "./features/sources/SourcesPanel";
import { TargetsPanel } from "./features/targets/TargetsPanel";
import { JobsPanel } from "./features/jobs/JobsPanel";
import { ManualUploadsPanel } from "./features/manual-uploads/ManualUploadsPanel";
import { RunsPanel } from "./features/runs/RunsPanel";
import { DeleteDialog, type DeleteTarget } from "./shared/components/DeleteDialog";
import { stringField } from "./shared/utils/form";
import { errorMessage } from "./shared/utils/error";
import { toUpsertDatabaseConnection } from "./features/sources/sourceForm";
import { toUpsertBackupTarget } from "./features/targets/targetForm";
import { toUpsertBackupJob } from "./features/jobs/jobForm";
import { ApiError, apiRequest } from "./api/client";
import { login } from "./shared/api/auth";
import { fallbackPublicConfig, getPublicConfig } from "./shared/api/config";
import { uploadManualBackup } from "./shared/api/manualUploads";
import { toast } from "sonner";

type TabKey = "dashboard" | "sources" | "targets" | "jobs" | "manualUploads" | "runs";
type AppSearch = { runId?: string };
type SubmitResult = Promise<boolean>;
type TestSourceResult = Promise<TestDatabaseConnectionResult>;

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

const tabPaths: Record<TabKey, "/dashboard" | "/sources" | "/targets" | "/jobs" | "/manual-uploads" | "/runs"> = {
  dashboard: "/dashboard",
  sources: "/sources",
  targets: "/targets",
  jobs: "/jobs",
  manualUploads: "/manual-uploads",
  runs: "/runs",
};

function pathToTab(pathname: string): TabKey {
  if (pathname === "/dashboard") return "dashboard";
  if (pathname === "/sources") return "sources";
  if (pathname === "/targets") return "targets";
  if (pathname === "/jobs") return "jobs";
  if (pathname === "/manual-uploads") return "manualUploads";
  if (pathname === "/runs") return "runs";
  return "dashboard";
}

function validateAppSearch(search: Record<string, unknown>): AppSearch {
  return {
    runId: typeof search.runId === "string" && search.runId.trim() ? search.runId : undefined,
  };
}

function AppContent() {
  const navigate = useNavigate();
  const location = useRouterState({ select: (state) => state.location });
  const activeTab = pathToTab(location.pathname);
  const runIdFromUrl = (location.search as AppSearch).runId ?? null;
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [data, setData] = useState<AppData>(emptyData);
  const [publicConfig, setPublicConfig] = useState<PublicAppConfig>(fallbackPublicConfig);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState("");
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

  useEffect(() => {
    let cancelled = false;

    getPublicConfig()
      .then((config) => {
        if (!cancelled) setPublicConfig(config);
      })
      .catch((configError) => {
        console.warn("Failed to load public config", configError);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
    if (!token || !runIdFromUrl || selectedRunId === runIdFromUrl) return;
    loadRunLogs(runIdFromUrl);
  }, [runIdFromUrl, selectedRunId, token]);

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
          if (latestRun.status === "Success") {
            toast.success("备份已完成");
          } else {
            setError("备份执行失败，请查看运行日志");
          }
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
      const response = await login({
        username: stringField(form, "username"),
        password: stringField(form, "password"),
      });
      localStorage.setItem("token", response.token);
      setToken(response.token);
      toast.success("登录成功");
    } catch (loginErrorValue) {
      setLoginError(errorMessage(loginErrorValue));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSaveSource(event: FormEvent<HTMLFormElement>, source: DatabaseConnection | null): SubmitResult {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = toUpsertDatabaseConnection(form);
    const ok = await submitForm(event.currentTarget, () =>
      request<DatabaseConnection>(source ? `/sources/${source.id}` : "/sources", {
        method: source ? "PUT" : "POST",
        body: JSON.stringify(payload),
      }),
    );
    if (ok) toast.success(source ? "数据源已更新" : "数据源已保存");
    return ok;
  }

  async function handleTestSource(form: FormData): TestSourceResult {
    const payload = toUpsertDatabaseConnection(form);
    return await request<TestDatabaseConnectionResult>("/sources/test", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function handleLoadSourceDatabases(sourceId: string): Promise<string[]> {
    const result = await request<SourceDatabasesResult>(`/sources/${sourceId}/databases`);
    return result.databases;
  }

  async function handleSaveTarget(event: FormEvent<HTMLFormElement>, target: BackupTarget | null): SubmitResult {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = toUpsertBackupTarget(form);
    const ok = await submitForm(event.currentTarget, () =>
      request<BackupTarget>(target ? `/targets/${target.id}` : "/targets", {
        method: target ? "PUT" : "POST",
        body: JSON.stringify(payload),
      }),
    );
    if (ok) toast.success(target ? "备份目标已更新" : "备份目标已保存");
    return ok;
  }

  async function handleTestTarget(form: FormData): SubmitResult {
    const payload = toUpsertBackupTarget(form);
    await request<{ ok: boolean }>("/targets/test", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return true;
  }

  async function handleSaveJob(event: FormEvent<HTMLFormElement>, job: BackupJob | null): SubmitResult {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = toUpsertBackupJob(form);
    const ok = await submitForm(event.currentTarget, () =>
      request<BackupJob>(job ? `/jobs/${job.id}` : "/jobs", {
        method: job ? "PUT" : "POST",
        body: JSON.stringify(payload),
      }),
    );
    if (ok) toast.success(job ? "备份任务已更新" : "备份任务已保存");
    return ok;
  }

  async function submitForm(form: HTMLFormElement, action: () => Promise<unknown>) {
    setIsSubmitting(true);
    setError("");
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
    try {
      const run = await request<BackupRun>(`/jobs/${jobId}/run`, { method: "POST" });
      setActiveRunId(run.id);
      setSelectedRunId(run.id);
      setRunLogs([]);
      setData((current) => ({
        ...current,
        runs: [run, ...current.runs.filter((item) => item.id !== run.id)],
      }));
      toast.info("任务已提交，正在等待执行结果");
      const refreshed = await refresh();
      const latestRun = refreshed?.runs.find((item) => item.id === run.id);
      if (latestRun && !isRunInProgress(latestRun)) {
        if (latestRun.status === "Success") {
          toast.success("备份已完成");
        } else {
          setError("备份执行失败，请查看运行日志");
        }
        setRunLogs(await request<BackupRunLog[]>(`/runs/${run.id}/logs`));
      }
    } catch (runError) {
      setError(errorMessage(runError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleManualUpload(event: FormEvent<HTMLFormElement>): SubmitResult {
    event.preventDefault();
    if (!token) return false;
    setIsSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const run = await uploadManualBackup(token, form);
      setActiveRunId(run.id);
      setSelectedRunId(run.id);
      setRunLogs([]);
      setData((current) => ({
        ...current,
        runs: [run, ...current.runs.filter((item) => item.id !== run.id)],
      }));
      event.currentTarget.reset();
      toast.info("手动上传已提交，正在等待执行结果");
      await refresh();
      navigate({ to: "/runs", search: { runId: run.id } });
      return true;
    } catch (uploadError) {
      setError(errorMessage(uploadError));
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteItem(target: NonNullable<DeleteTarget>) {
    setIsSubmitting(true);
    setError("");
    try {
      await request<void>(target.path, { method: "DELETE" });
      toast.success(target.successMessage);
      setDeleteTarget(null);
      await refresh();
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function downloadRunFile(run: BackupRun) {
    setError("");
    try {
      const headers = new Headers();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      const response = await fetch(`/api/runs/${run.id}/file`, { headers });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new ApiError(data?.message || response.statusText || "下载失败", response.status, data?.code);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = run.archiveFileName || `${run.id}.gz`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(errorMessage(downloadError));
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

  function navigateToTab(tab: TabKey) {
    navigate({ to: tabPaths[tab] });
  }

  function viewRun(runId: string) {
    navigate({ to: "/runs", search: { runId } });
    loadRunLogs(runId);
  }

  if (!token) {
    return <LoginPage error={loginError} isSubmitting={isSubmitting} onSubmit={handleLogin} />;
  }

  return (
    <AppShell
      activeTab={activeTab}
      isLoading={isLoading}
      error={error}
      onTabChange={(tab) => navigateToTab(tab as TabKey)}
      onLogout={logout}
      onRefresh={refresh}
    >
      {activeTab === "dashboard" && (
        <DashboardPanel
          dashboard={data.dashboard}
          onViewRun={viewRun}
        />
      )}
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
          onTest={handleTestSource}
          onSubmit={handleSaveSource}
        />
      )}
      {activeTab === "targets" && (
        <TargetsPanel
          defaults={publicConfig.defaults}
          isSubmitting={isSubmitting}
          items={data.targets}
          onDelete={(target) =>
            setDeleteTarget({
              label: `备份目标「${target.name}」`,
              path: `/targets/${target.id}`,
              successMessage: "备份目标已删除",
            })
          }
          onTest={handleTestTarget}
          onSubmit={handleSaveTarget}
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
          onGoToSources={() => navigateToTab("sources")}
          onGoToTargets={() => navigateToTab("targets")}
          onLoadSourceDatabases={handleLoadSourceDatabases}
          onSubmit={handleSaveJob}
          onViewRun={viewRun}
        />
      )}
      {activeTab === "manualUploads" && (
        <ManualUploadsPanel
          isSubmitting={isSubmitting}
          sources={data.sources}
          targets={data.targets}
          onSubmit={handleManualUpload}
        />
      )}
      {activeTab === "runs" && (
        <RunsPanel
          jobs={data.jobs}
          logs={runLogs}
          runs={data.runs}
          selectedRunId={selectedRunId}
          onDeleteFile={(run) =>
            setDeleteTarget({
              label: `备份文件「${run.archiveFileName || run.id}」`,
              path: `/runs/${run.id}/file`,
              successMessage: "备份文件已删除",
            })
          }
          onDownloadFile={downloadRunFile}
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

const rootRoute = createRootRoute({
  component: AppContent,
  validateSearch: validateAppSearch,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
});

const sourcesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sources",
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
});

const targetsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/targets",
});

const jobsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/jobs",
});

const manualUploadsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/manual-uploads",
});

const runsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/runs",
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardRoute,
  sourcesRoute,
  targetsRoute,
  jobsRoute,
  manualUploadsRoute,
  runsRoute,
]);

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function App() {
  return <RouterProvider router={router} />;
}

function isRunInProgress(run: BackupRun | null) {
  return run?.status === "Pending" || run?.status === "Running";
}

export default App;
