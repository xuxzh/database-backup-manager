import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SourcesPanel } from "../SourcesPanel";

describe("SourcesPanel", () => {
  it("enables save only after required source fields pass a successful connection test", async () => {
    const onTest = vi.fn().mockResolvedValue(true);
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

    fireEvent.change(screen.getByPlaceholderText("127.0.0.1"), { target: { value: "10.0.0.2" } });

    expect(saveButton).toBeDisabled();
  });
});
