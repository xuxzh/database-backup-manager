import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "../StatusBadge";

describe("StatusBadge", () => {
  it("should render Success status", () => {
    render(<StatusBadge status="Success" />);
    expect(screen.getByText("Success")).toBeInTheDocument();
  });

  it("should render Failed status", () => {
    render(<StatusBadge status="Failed" />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("should render Running status", () => {
    render(<StatusBadge status="Running" />);
    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  it("should render Pending status", () => {
    render(<StatusBadge status="Pending" />);
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("should handle lowercase status", () => {
    render(<StatusBadge status="Success" />);
    expect(screen.getByText("Success")).toBeInTheDocument();
  });
});