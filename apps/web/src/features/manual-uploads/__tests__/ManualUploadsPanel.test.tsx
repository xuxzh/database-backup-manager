import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ManualUploadsPanel } from "../ManualUploadsPanel";
import type { BackupTarget, DatabaseConnection } from "@/types/api";

const source: DatabaseConnection = {
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
  createdAt: "2026-05-24T00:00:00Z",
  updatedAt: "2026-05-24T00:00:00Z",
};

describe("ManualUploadsPanel", () => {
  it("uses saved data sources as the upload source selector", () => {
    render(
      <ManualUploadsPanel
        sources={[source]}
        targets={[target]}
        isSubmitting={false}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole("combobox", { name: "数据源" })).toBeInTheDocument();
    expect(screen.queryByLabelText("来源名称")).not.toBeInTheDocument();
  });
});
