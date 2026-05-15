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

global.Intl.DateTimeFormat = class {
  format(_date?: Date): string {
    return "2026/01/01 12:00:00";
  }
} as unknown as typeof Intl.DateTimeFormat;