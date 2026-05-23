import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { apiRequest } from "./api/client";

vi.mock("./api/client", async () => {
  const actual = await vi.importActual<typeof import("./api/client")>("./api/client");
  return {
    ...actual,
    apiRequest: vi.fn(),
  };
});

const mockedApiRequest = vi.mocked(apiRequest);

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
});
