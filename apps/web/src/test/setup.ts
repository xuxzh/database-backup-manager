import "@testing-library/jest-dom";
import { vi } from "vitest";

vi.mock("react-dom", () => ({
  createRoot: vi.fn(),
}));

global.ResizeObserver = class {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
} as unknown as typeof ResizeObserver;

Element.prototype.scrollIntoView = vi.fn();

global.Intl.DateTimeFormat = class {
  format(_date?: Date): string {
    return "2026/01/01 12:00:00";
  }
} as unknown as typeof Intl.DateTimeFormat;
