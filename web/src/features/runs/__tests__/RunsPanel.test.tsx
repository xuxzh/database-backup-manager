import { fireEvent, render, screen } from "@testing-library/react";
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
  errorMessage: null,
  createdAt: "2026-05-22T00:33:30Z",
};

const log: BackupRunLog = {
  id: "log-1",
  backupRunId: "run-1",
  timestamp: "2026-05-22T00:33:34Z",
  level: "INFO",
  stage: "done",
  message: "备份执行完成",
};

function RunsPanelHarness({ onLoadLogs }: { onLoadLogs: (runId: string) => void }) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const logs = selectedRunId === run.id ? [log] : [];

  return (
    <RunsPanel
      jobs={[job]}
      logs={logs}
      runs={[run]}
      selectedRunId={selectedRunId}
      onLoadLogs={(runId) => {
        setSelectedRunId(runId);
        onLoadLogs(runId);
      }}
    />
  );
}

describe("RunsPanel", () => {
  it("opens run logs in a dialog from the selected run", () => {
    const onLoadLogs = vi.fn();
    render(<RunsPanelHarness onLoadLogs={onLoadLogs} />);

    expect(screen.queryByText(/备份执行完成/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看日志" }));

    expect(onLoadLogs).toHaveBeenCalledWith("run-1");
    expect(screen.getByRole("dialog", { name: "运行日志" })).toBeInTheDocument();
    expect(screen.getByText(/备份执行完成/)).toBeInTheDocument();
  });
});
