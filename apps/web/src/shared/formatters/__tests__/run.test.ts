import { describe, it, expect } from "vitest";
import { stageLabel, latestRunLogText, isRunInProgress } from "../run";
import type { BackupRunLog } from "@/types/api";

describe("stageLabel", () => {
  it("should return Chinese label for known stages", () => {
    expect(stageLabel("pending")).toBe("等待调度");
    expect(stageLabel("dump")).toBe("导出数据库");
    expect(stageLabel("upload")).toBe("上传远端");
    expect(stageLabel("done")).toBe("执行完成");
    expect(stageLabel("failed")).toBe("执行失败");
  });

  it("should return original stage for unknown stages", () => {
    expect(stageLabel("unknown_stage")).toBe("unknown_stage");
  });
});

describe("latestRunLogText", () => {
  it("should return waiting message for empty logs", () => {
    expect(latestRunLogText([])).toBe("正在等待第一条执行日志");
  });

  it("should return formatted latest log text", () => {
    const logs: BackupRunLog[] = [
      {
        id: "1",
        backupRunId: "run1",
        timestamp: "2026-01-01T10:00:00Z",
        level: "info",
        stage: "dump",
        message: "Starting export",
      },
    ];
    expect(latestRunLogText(logs)).toBe("导出数据库：Starting export");
  });
});

describe("isRunInProgress", () => {
  it("should return true for Pending status", () => {
    const run = { status: "Pending" } as any;
    expect(isRunInProgress(run)).toBe(true);
  });

  it("should return true for Running status", () => {
    const run = { status: "Running" } as any;
    expect(isRunInProgress(run)).toBe(true);
  });

  it("should return false for Success status", () => {
    const run = { status: "Success" } as any;
    expect(isRunInProgress(run)).toBe(false);
  });

  it("should return false for Failed status", () => {
    const run = { status: "Failed" } as any;
    expect(isRunInProgress(run)).toBe(false);
  });

  it("should return false for null", () => {
    expect(isRunInProgress(null)).toBe(false);
  });
});