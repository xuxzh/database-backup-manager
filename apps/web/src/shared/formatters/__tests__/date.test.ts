import { describe, it, expect } from "vitest";
import { formatDate } from "../date";

describe("formatDate", () => {
  it("should return empty string for null", () => {
    expect(formatDate(null)).toBe("");
  });

  it("should return empty string for empty string", () => {
    expect(formatDate("")).toBe("");
  });

  it("should format valid date string", () => {
    const result = formatDate("2026-01-15T10:30:00");
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });

  it("should return original value for invalid date", () => {
    expect(formatDate("invalid-date")).toBe("invalid-date");
  });
});