import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { JobsPanel } from "../JobsPanel";
import type { BackupJob, BackupTarget, DatabaseConnection } from "@/types/api";

const source: DatabaseConnection = {
  id: "source-1",
  name: "生产库",
  dbType: "mysql",
  host: "127.0.0.1",
  port: 3306,
  username: "backup",
  password: null,
  databaseName: "app",
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

describe("JobsPanel", () => {
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
});
