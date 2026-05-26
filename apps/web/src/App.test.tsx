import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { apiRequest } from "./api/client";
import type { BackupRun, BackupTarget, DatabaseConnection } from "./types/api";

vi.mock("./api/client", async () => {
  const actual = await vi.importActual<typeof import("./api/client")>("./api/client");
  return {
    ...actual,
    apiRequest: vi.fn(),
  };
});

const mockedApiRequest = vi.mocked(apiRequest);

const manualSource: DatabaseConnection = {
  id: "source-1",
  name: "离线生产库",
  dbType: "mysql",
  host: "",
  port: 3306,
  username: "",
  password: null,
  databaseName: "app",
  backupMode: "manual",
  executionMode: "local",
  remoteHost: null,
  remotePort: null,
  remoteUsername: null,
  remoteAuthMethod: null,
  remoteSecret: null,
  remoteToolPath: null,
  remoteWorkingDir: null,
  configJson: {},
  createdAt: "2026-05-24T00:00:00Z",
  updatedAt: "2026-05-24T00:00:00Z",
};

const backupTarget: BackupTarget = {
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
  createdAt: "2026-05-24T00:00:00Z",
  updatedAt: "2026-05-24T00:00:00Z",
};

const manualRun: BackupRun = {
  id: "run-1",
  backupJobId: "",
  runType: "manualUpload",
  jobName: null,
  sourceName: "离线生产库",
  sourceType: "mysql",
  sourceEndpoint: "",
  databaseName: "app",
  targetName: "备份服务器",
  targetType: "ssh",
  targetBaseDir: "/data/backups",
  status: "Running",
  stage: "queued",
  startedAt: "2026-05-24T00:00:00Z",
  finishedAt: null,
  durationMs: null,
  rawFileName: null,
  archiveFileName: null,
  fileSize: null,
  checksum: null,
  remotePath: null,
  fileDeleted: false,
  fileDeletedAt: null,
  errorMessage: null,
  createdAt: "2026-05-24T00:00:00Z",
};

describe("App routing", () => {
  beforeEach(() => {
    localStorage.setItem("token", "test-token");
    window.history.replaceState(null, "", "/");
    mockedApiRequest.mockReset();
    mockedApiRequest.mockImplementation(async (path) => {
      if (path === "/dashboard") {
        return { sourceCount: 0, targetCount: 0, jobCount: 0, runningCount: 0, failedCount: 0 };
      }
      if (path === "/sources" || path === "/targets" || path === "/jobs" || path === "/runs") {
        return [];
      }
      throw new Error(`Unexpected request: ${path}`);
    });
  });

  it("opens the matching page for the current pathname", async () => {
    window.history.replaceState(null, "", "/sources");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "数据源", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("配置 MySQL 和 PostgreSQL 连接")).toBeInTheDocument();
  });

  it("updates the browser pathname when navigating from the sidebar", async () => {
    render(<App />);

    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledWith("/dashboard", expect.anything()));
    fireEvent.click(screen.getByRole("button", { name: /运行记录/ }));

    await waitFor(() => expect(window.location.pathname).toBe("/runs"));
    expect(await screen.findByRole("heading", { name: "运行记录", level: 2 })).toBeInTheDocument();
  });

  it("does not show a form reset error after a manual upload is accepted", async () => {
    window.history.replaceState(null, "", "/manual-uploads");
    mockedApiRequest.mockImplementation(async (path) => {
      if (path === "/dashboard") {
        return { sourceCount: 1, targetCount: 1, jobCount: 0, runningCount: 1, failedCount: 0 };
      }
      if (path === "/sources") return [manualSource];
      if (path === "/targets") return [backupTarget];
      if (path === "/jobs") return [];
      if (path === "/runs") return [manualRun];
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => manualRun,
    } as Response);

    render(<App />);

    const submitButton = await screen.findByRole("button", { name: /开始上传/ });
    const form = submitButton.closest("form");
    expect(form).not.toBeNull();

    fireEvent.submit(form!);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith("/api/manual-uploads", expect.anything()));
    expect(screen.queryByText(/Cannot read properties of null/)).not.toBeInTheDocument();
  });
});
