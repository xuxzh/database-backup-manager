import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { BackupJob, BackupRun, BackupRunLog } from "@/types/api";
import { RunsPanel } from "../RunsPanel";

const job: BackupJob = {
  id: "job-1",
  name: "生产库备份",
  databaseConnectionId: "source-1",
  databaseName: "app",
  backupTargetId: "target-1",
  schedule: "0 0 2 * * *",
  compression: "gzip",
  remoteRetentionDays: 30,
  localRetentionDays: 7,
  enabled: true,
  createdAt: "2026-05-21T00:00:00Z",
  updatedAt: "2026-05-21T00:00:00Z",
};

const reportingJob: BackupJob = {
  ...job,
  id: "job-2",
  name: "报表库备份",
  databaseConnectionId: "source-2",
  databaseName: "reporting",
};

const run: BackupRun = {
  id: "run-1",
  backupJobId: "job-1",
  status: "Success",
  stage: "done",
  startedAt: "2026-05-22T00:33:30Z",
  finishedAt: "2026-05-22T00:33:34Z",
  durationMs: 4000,
  rawFileName: null,
  archiveFileName: "app.sql.gz",
  fileSize: 1024,
  checksum: "abc123",
  remotePath: "/backup/app.sql.gz",
  fileDeleted: false,
  fileDeletedAt: null,
  errorMessage: null,
  createdAt: "2026-05-22T00:33:30Z",
};

const failedRun: BackupRun = {
  ...run,
  id: "run-2",
  status: "Failed",
  stage: "upload",
  startedAt: "2026-05-21T00:33:30Z",
  finishedAt: "2026-05-21T00:33:34Z",
  errorMessage: "上传失败",
};

const reportingRun: BackupRun = {
  ...run,
  id: "run-3",
  backupJobId: "job-2",
  status: "Running",
  stage: "compress",
  startedAt: "2026-05-23T00:33:30Z",
  finishedAt: null,
};

const log: BackupRunLog = {
  id: "log-1",
  backupRunId: "run-1",
  timestamp: "2026-05-22T00:33:34Z",
  level: "INFO",
  stage: "done",
  message: "备份执行完成",
};

function RunsPanelHarness({
  onDeleteFile = vi.fn(),
  onDownloadFile = vi.fn(),
  onLoadLogs,
}: {
  onDeleteFile?: (run: BackupRun) => void;
  onDownloadFile?: (run: BackupRun) => void;
  onLoadLogs: (runId: string) => void;
}) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const logs = selectedRunId === run.id ? [log] : [];

  return (
    <RunsPanel
      jobs={[job]}
      logs={logs}
      runs={[run]}
      selectedRunId={selectedRunId}
      onDeleteFile={onDeleteFile}
      onDownloadFile={onDownloadFile}
      onLoadLogs={(runId) => {
        setSelectedRunId(runId);
        onLoadLogs(runId);
      }}
    />
  );
}

describe("RunsPanel", () => {
  it("groups run records by backup job", () => {
    render(
      <RunsPanel
        jobs={[job, reportingJob]}
        logs={[]}
        runs={[reportingRun, run, failedRun]}
        selectedRunId={null}
        onDeleteFile={vi.fn()}
        onDownloadFile={vi.fn()}
        onLoadLogs={vi.fn()}
      />,
    );

    expect(screen.getByRole("row", { name: /生产库备份.*2 条记录.*1 成功.*1 失败/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /报表库备份.*1 条记录.*1 执行中/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Success.*完成/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Failed.*上传.*上传失败/ })).toBeInTheDocument();
  });

  it("shows remote file actions for successful backup runs", () => {
    const onDeleteFile = vi.fn();
    const onDownloadFile = vi.fn();
    render(<RunsPanelHarness onDeleteFile={onDeleteFile} onDownloadFile={onDownloadFile} onLoadLogs={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "下载备份文件" }));
    fireEvent.click(screen.getByRole("button", { name: "删除备份文件" }));

    expect(onDownloadFile).toHaveBeenCalledWith(run);
    expect(onDeleteFile).toHaveBeenCalledWith(run);
  });

  it("marks deleted remote files and disables downloads", () => {
    render(
      <RunsPanel
        jobs={[job]}
        logs={[]}
        runs={[{ ...run, fileDeleted: true, fileDeletedAt: "2026-05-22T00:40:00Z" }]}
        selectedRunId={null}
        onDeleteFile={vi.fn()}
        onDownloadFile={vi.fn()}
        onLoadLogs={vi.fn()}
      />,
    );

    expect(screen.getByText("已删除")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下载备份文件" })).toBeDisabled();
  });

  it("opens run logs in a dialog from the selected run", () => {
    const onLoadLogs = vi.fn();
    render(<RunsPanelHarness onLoadLogs={onLoadLogs} />);

    expect(screen.queryByText(/备份执行完成/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看日志" }));

    expect(onLoadLogs).toHaveBeenCalledWith("run-1");
    expect(screen.getByRole("dialog", { name: "运行日志" })).toBeInTheDocument();
    expect(screen.getByText(/备份执行完成/)).toBeInTheDocument();
  });

  it("selects the log text when the clipboard api is unavailable", async () => {
    const onLoadLogs = vi.fn();
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const select = vi.spyOn(HTMLTextAreaElement.prototype, "select").mockImplementation(() => {});
    const setSelectionRange = vi.spyOn(HTMLTextAreaElement.prototype, "setSelectionRange").mockImplementation(() => {});

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });

    render(<RunsPanelHarness onLoadLogs={onLoadLogs} />);

    fireEvent.click(screen.getByRole("button", { name: "查看日志" }));
    fireEvent.click(screen.getByRole("button", { name: "复制日志" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "按 Cmd+C" })).toBeInTheDocument());
    expect(select).toHaveBeenCalled();
    expect(setSelectionRange).toHaveBeenCalledWith(0, expect.any(Number));

    if (clipboardDescriptor) {
      Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
    }
    select.mockRestore();
    setSelectionRange.mockRestore();
  });

  it("selects the log text when clipboard writes are rejected", async () => {
    const onLoadLogs = vi.fn();
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const select = vi.spyOn(HTMLTextAreaElement.prototype, "select").mockImplementation(() => {});
    const setSelectionRange = vi.spyOn(HTMLTextAreaElement.prototype, "setSelectionRange").mockImplementation(() => {});

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("blocked")) },
    });

    render(<RunsPanelHarness onLoadLogs={onLoadLogs} />);

    fireEvent.click(screen.getByRole("button", { name: "查看日志" }));
    fireEvent.click(screen.getByRole("button", { name: "复制日志" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "按 Cmd+C" })).toBeInTheDocument());
    expect(select).toHaveBeenCalled();
    expect(setSelectionRange).toHaveBeenCalledWith(0, expect.any(Number));

    if (clipboardDescriptor) {
      Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
    }
    select.mockRestore();
    setSelectionRange.mockRestore();
  });
});
