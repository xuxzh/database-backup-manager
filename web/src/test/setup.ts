import "@testing-library/jest-dom";
import { vi } from "vitest";

vi.mock("react-dom", () => ({
  createRoot: vi.fn(),
}));

global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

global.Intl.DateTimeFormat = class extends Intl.DateTimeFormat {
  constructor() {
    super("zh-CN", { dateStyle: "short", timeStyle: "medium", hour12: false });
  }
  override format() {
    return "2026/01/01 12:00:00";
  }
};