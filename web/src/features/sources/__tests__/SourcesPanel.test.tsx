import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SourcesPanel } from "../SourcesPanel";
import type { DatabaseConnection } from "@/types/api";

const savedSource: DatabaseConnection = {
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

describe("SourcesPanel", () => {
  it("shows the saved default database when editing a source before retesting", async () => {
    render(
      <TooltipProvider>
        <SourcesPanel
          isSubmitting={false}
          items={[savedSource]}
          onDelete={vi.fn()}
          onTest={vi.fn()}
          onSubmit={vi.fn()}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "编辑数据源" }));

    expect(screen.getByRole("combobox", { name: "默认数据库" })).toHaveTextContent("app");
  });

  it("keeps the saved default database after editing credentials and retesting", async () => {
    const onTest = vi.fn().mockResolvedValue({ ok: true, databases: ["analytics", "app"] });

    render(
      <TooltipProvider>
        <SourcesPanel
          isSubmitting={false}
          items={[savedSource]}
          onDelete={vi.fn()}
          onTest={onTest}
          onSubmit={vi.fn()}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "编辑数据源" }));

    const databaseSelect = screen.getByRole("combobox", { name: "默认数据库" });
    fireEvent.change(screen.getByPlaceholderText("留空表示不修改"), { target: { value: "new-secret" } });

    expect(databaseSelect).toHaveTextContent("app");

    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));

    await waitFor(() => expect(onTest).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "默认数据库" })).toHaveTextContent("app");
    });
  });

  it("enables save only after required source fields pass a successful connection test", async () => {
    const onTest = vi.fn().mockResolvedValue({ ok: true, databases: ["app", "analytics"] });
    const onSubmit = vi.fn().mockResolvedValue(true);

    render(
      <SourcesPanel
        isSubmitting={false}
        items={[]}
        onDelete={vi.fn()}
        onTest={onTest}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "新建数据源" }));

    const saveButton = screen.getByRole("button", { name: "保存" });
    expect(saveButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));

    expect(onTest).not.toHaveBeenCalled();
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("生产库"), { target: { value: "生产库" } });
    fireEvent.change(screen.getByPlaceholderText("127.0.0.1"), { target: { value: "127.0.0.1" } });
    fireEvent.change(screen.getByPlaceholderText("backup"), { target: { value: "backup" } });
    fireEvent.change(screen.getByPlaceholderText("数据库密码"), { target: { value: "secret" } });

    expect(saveButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));

    await waitFor(() => expect(onTest).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(saveButton).toBeEnabled());
    expect(screen.getByRole("combobox", { name: "默认数据库" })).toHaveTextContent("app");

    fireEvent.change(screen.getByPlaceholderText("127.0.0.1"), { target: { value: "10.0.0.2" } });

    expect(saveButton).toBeDisabled();
  });
});
