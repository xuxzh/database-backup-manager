import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "../AppShell";

describe("AppShell", () => {
  it("keeps page errors visible until the user closes them", () => {
    render(
      <AppShell
        activeTab="runs"
        isLoading={false}
        error="备份执行失败，请查看运行日志"
        onTabChange={vi.fn()}
        onLogout={vi.fn()}
        onRefresh={vi.fn()}
      >
        <div>运行记录内容</div>
      </AppShell>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("备份执行失败，请查看运行日志");

    fireEvent.click(screen.getByRole("button", { name: "关闭错误提示" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
