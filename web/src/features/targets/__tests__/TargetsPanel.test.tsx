import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TargetsPanel } from "../TargetsPanel";

const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
  },
}));

describe("TargetsPanel", () => {
  it("uses configured defaults when creating a backup target", () => {
    render(
      <TargetsPanel
        defaults={{ targetBaseDir: "/srv/backups", sshPort: 2202 }}
        isSubmitting={false}
        items={[]}
        onDelete={vi.fn()}
        onTest={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "新建备份目标" }));

    expect(screen.getByDisplayValue("2202")).toBeInTheDocument();
    expect(screen.getByDisplayValue("/srv/backups")).toBeInTheDocument();
  });

  it("shows successful target tests as a toast instead of an inline alert", async () => {
    const onTest = vi.fn().mockResolvedValue(true);

    render(
      <TargetsPanel
        defaults={{ targetBaseDir: "~/backups", sshPort: 22 }}
        isSubmitting={false}
        items={[]}
        onDelete={vi.fn()}
        onTest={onTest}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "新建备份目标" }));
    fireEvent.change(screen.getByPlaceholderText("远端备份机"), { target: { value: "远端备份机" } });
    fireEvent.change(screen.getByPlaceholderText("10.0.0.8"), { target: { value: "10.0.0.8" } });
    fireEvent.change(screen.getByPlaceholderText("backup"), { target: { value: "backup" } });
    fireEvent.change(screen.getByPlaceholderText("粘贴 SSH 私钥"), { target: { value: "private-key" } });

    fireEvent.click(screen.getByRole("button", { name: "测试目标" }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("备份目标测试成功，可以保存目标。"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
