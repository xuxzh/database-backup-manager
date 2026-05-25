import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { JobsPanel } from "../JobsPanel";
import type { BackupJob, BackupRun, BackupRunLog, BackupTarget, DatabaseConnection } from "@/types/api";

const source: DatabaseConnection = {
  id: "source-1",
  name: "生产库",
  dbType: "mysql",
  host: "127.0.0.1",
  port: 3306,
  username: "backup",
  password: null,
  databaseName: "app",
  backupMode: "automatic",
  executionMode: "local",
  remoteHost: null,
  remotePort: null,
  remoteUsername: null,
  remoteAuthMethod: null,
  remoteSecret: null,
  remoteToolPath: null,
  remoteWorkingDir: null,
  configJson: {},
  createdAt: "2026-05-21T00:00:00Z",
  updatedAt: "2026-05-21T00:00:00Z",
};

const target: BackupTarget = {
  id: "target-1",
  name: "备份服务器",
  targetType: "ssh",
  host: "10.0.0.10",
  port: 22,
  username: "backup",
  authMethod: "password",
  secret: null,
  baseDir: "/data/backups",
  configJson: {},
  createdAt: "2026-05-21T00:00:00Z",
  updatedAt: "2026-05-21T00:00:00Z",
};

const job: BackupJob = {
  id: "job-1",
  name: "分析库备份",
  databaseConnectionId: "source-1",
  databaseName: "analytics",
  backupTargetId: "target-1",
  schedule: "0 0 2 * * *",
  compression: "gzip",
  remoteRetentionDays: 30,
  localRetentionDays: 7,
  enabled: true,
  createdAt: "2026-05-21T00:00:00Z",
  updatedAt: "2026-05-21T00:00:00Z",
};

const activeRun: BackupRun = {
  id: "run-1",
  backupJobId: "job-1",
  runType: "scheduled",
  status: "Running",
  stage: "upload",
  startedAt: "2026-05-25T02:38:17Z",
  finishedAt: null,
  durationMs: null,
  rawFileName: null,
  archiveFileName: "analytics_2026-05-25_023817.sql.gz",
  fileSize: null,
  checksum: null,
  remotePath: "/data/backups/scheduled/analytics/2026-05-25/analytics_2026-05-25_023817.sql.gz",
  fileDeleted: false,
  fileDeletedAt: null,
  errorMessage: null,
  createdAt: "2026-05-25T02:38:17Z",
};

const activeRunLogs: BackupRunLog[] = [
  {
    id: "log-1",
    backupRunId: "run-1",
    timestamp: "2026-05-25T02:38:20Z",
    level: "INFO",
    stage: "upload",
    message: "正在上传备份文件",
  },
];

describe("JobsPanel", () => {
  it("groups backup jobs by database source", () => {
    const reportingSource: DatabaseConnection = {
      ...source,
      id: "source-2",
      name: "报表库",
      host: "10.0.0.20",
      port: 5432,
      dbType: "postgres",
      databaseName: "reports",
    };
    const reportingJob: BackupJob = {
      ...job,
      id: "job-2",
      name: "报表库备份",
      databaseConnectionId: "source-2",
      databaseName: "reports",
      enabled: false,
    };

    render(
      <TooltipProvider>
        <JobsPanel
          activeRun={null}
          activeRunLogs={[]}
          isSubmitting={false}
          jobs={[job, reportingJob]}
          sources={[source, reportingSource]}
          targets={[target]}
          onDelete={vi.fn()}
          onGoToSources={vi.fn()}
          onGoToTargets={vi.fn()}
          onLoadSourceDatabases={vi.fn()}
          onRun={vi.fn()}
          onSubmit={vi.fn()}
          onViewRun={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole("row", { name: /展开 生产库 mysql 127\.0\.0\.1:3306 1 个任务 1 个启用/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /展开 报表库 postgres 10\.0\.0\.20:5432 1 个任务 0 个启用/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /分析库备份 analytics 备份服务器 0 0 2 \* \* \* 是/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /报表库备份 reports 备份服务器 0 0 2 \* \* \* 否/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "展开" })[0]);

    expect(screen.getByRole("row", { name: /收起 生产库 mysql 127\.0\.0\.1:3306 1 个任务 1 个启用/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /分析库备份 analytics 备份服务器 0 0 2 \* \* \* 是/ })).toBeInTheDocument();
  });

  it("loads backup databases from the selected source when creating a job", async () => {
    const onLoadSourceDatabases = vi.fn().mockResolvedValue(["app", "analytics"]);

    render(
      <TooltipProvider>
        <JobsPanel
          activeRun={null}
          activeRunLogs={[]}
          isSubmitting={false}
          jobs={[]}
          sources={[source]}
          targets={[target]}
          onDelete={vi.fn()}
          onGoToSources={vi.fn()}
          onGoToTargets={vi.fn()}
          onLoadSourceDatabases={onLoadSourceDatabases}
          onRun={vi.fn()}
          onSubmit={vi.fn()}
          onViewRun={vi.fn()}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "新建备份任务" }));
    fireEvent.click(screen.getAllByRole("combobox")[0]);
    const sourceOptions = await screen.findAllByText("生产库");
    fireEvent.click(sourceOptions[sourceOptions.length - 1]);

    await waitFor(() => expect(onLoadSourceDatabases).toHaveBeenCalledWith("source-1"));

    fireEvent.click(screen.getAllByRole("combobox")[1]);
    const databaseOptions = await screen.findAllByText("analytics");
    fireEvent.click(databaseOptions[databaseOptions.length - 1]);

    expect(screen.getByRole("combobox", { name: "备份数据库" })).toHaveTextContent("analytics");
  });

  it("keeps the saved job database when editing a job", () => {
    render(
      <TooltipProvider>
        <JobsPanel
          activeRun={null}
          activeRunLogs={[]}
          isSubmitting={false}
          jobs={[job]}
          sources={[source]}
          targets={[target]}
          onDelete={vi.fn()}
          onGoToSources={vi.fn()}
          onGoToTargets={vi.fn()}
          onLoadSourceDatabases={vi.fn().mockResolvedValue(["app", "analytics"])}
          onRun={vi.fn()}
          onSubmit={vi.fn()}
          onViewRun={vi.fn()}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "展开" }));
    fireEvent.click(screen.getByRole("button", { name: "编辑备份任务" }));

    expect(screen.getByRole("combobox", { name: "备份数据库" })).toHaveTextContent("analytics");
  });

  it("falls back to manual database input when database loading fails", async () => {
    render(
      <TooltipProvider>
        <JobsPanel
          activeRun={null}
          activeRunLogs={[]}
          isSubmitting={false}
          jobs={[]}
          sources={[source]}
          targets={[target]}
          onDelete={vi.fn()}
          onGoToSources={vi.fn()}
          onGoToTargets={vi.fn()}
          onLoadSourceDatabases={vi.fn().mockRejectedValue(new Error("连接失败"))}
          onRun={vi.fn()}
          onSubmit={vi.fn()}
          onViewRun={vi.fn()}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "新建备份任务" }));
    fireEvent.click(screen.getAllByRole("combobox")[0]);
    const sourceOptions = await screen.findAllByText("生产库");
    fireEvent.click(sourceOptions[sourceOptions.length - 1]);

    const input = await screen.findByPlaceholderText("业务库名");
    expect(input).toHaveValue("app");
    expect(screen.getByText("数据库列表获取失败，可手动输入库名。")).toBeInTheDocument();
  });

  it("uses manual database input for manual backup sources without loading databases", async () => {
    const manualSource: DatabaseConnection = {
      ...source,
      id: "source-manual",
      name: "离线库",
      host: "",
      username: "",
      databaseName: "offline_app",
      backupMode: "manual",
    };
    const onLoadSourceDatabases = vi.fn();

    render(
      <TooltipProvider>
        <JobsPanel
          activeRun={null}
          activeRunLogs={[]}
          isSubmitting={false}
          jobs={[]}
          sources={[manualSource]}
          targets={[target]}
          onDelete={vi.fn()}
          onGoToSources={vi.fn()}
          onGoToTargets={vi.fn()}
          onLoadSourceDatabases={onLoadSourceDatabases}
          onRun={vi.fn()}
          onSubmit={vi.fn()}
          onViewRun={vi.fn()}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "新建备份任务" }));
    fireEvent.click(screen.getAllByRole("combobox")[0]);
    const sourceOptions = await screen.findAllByText("离线库");
    fireEvent.click(sourceOptions[sourceOptions.length - 1]);

    expect(screen.getByPlaceholderText("业务库名")).toHaveValue("offline_app");
    expect(screen.getByText("手动备份数据源需手动输入数据库名。")).toBeInTheDocument();
    expect(onLoadSourceDatabases).not.toHaveBeenCalled();
  });

  it("shows the manual run details in a responsive dialog instead of an inline card", () => {
    render(
      <TooltipProvider>
        <JobsPanel
          activeRun={activeRun}
          activeRunLogs={activeRunLogs}
          isSubmitting={false}
          jobs={[job]}
          sources={[source]}
          targets={[target]}
          onDelete={vi.fn()}
          onGoToSources={vi.fn()}
          onGoToTargets={vi.fn()}
          onLoadSourceDatabases={vi.fn()}
          onRun={vi.fn()}
          onSubmit={vi.fn()}
          onViewRun={vi.fn()}
        />
      </TooltipProvider>,
    );

    const dialog = screen.getByRole("dialog", { name: "本次手动执行" });
    expect(dialog).toHaveClass("active-run-dialog");
    expect(dialog).toHaveTextContent("分析库备份");
    expect(dialog).toHaveTextContent("正在上传备份文件");
    expect(dialog.querySelector(".active-run-grid")).toBeInTheDocument();
    expect(document.querySelector(".panel > .active-run-card")).not.toBeInTheDocument();
  });
});
