import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "../EmptyState";

describe("EmptyState", () => {
  it("should render text content", () => {
    render(<EmptyState text="暂无数据" />);
    expect(screen.getByText("暂无数据")).toBeInTheDocument();
  });

  it("should render different text content", () => {
    render(<EmptyState text="暂无运行记录" />);
    expect(screen.getByText("暂无运行记录")).toBeInTheDocument();
  });
});