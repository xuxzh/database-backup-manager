import { describe, it, expect } from "vitest";
import { formatDuration } from "../duration";

describe("formatDuration", () => {
  it("should return empty string for null", () => {
    expect(formatDuration(null)).toBe("");
  });

  it("should return ms for small values", () => {
    expect(formatDuration(500)).toBe("500ms");
  });

  it("should return seconds for values under a minute", () => {
    expect(formatDuration(5000)).toBe("5s");
  });

  it("should return minutes and seconds for values over a minute", () => {
    expect(formatDuration(90000)).toBe("1m 30s");
  });
});