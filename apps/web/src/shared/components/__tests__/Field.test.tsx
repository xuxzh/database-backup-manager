import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field } from "../Field";
import { Input } from "@/components/ui/input";

describe("Field", () => {
  it("should render label and children", () => {
    render(
      <Field label="用户名">
        <Input name="username" />
      </Field>
    );
    expect(screen.getByText("用户名")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("should render error message", () => {
    render(
      <Field label="端口">
        <Input name="port" />
        <p className="field-error">端口必须在 1-65535 之间</p>
      </Field>
    );
    expect(screen.getByText("端口必须在 1-65535 之间")).toBeInTheDocument();
  });
});