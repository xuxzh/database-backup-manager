import type { ReactNode } from "react";
import {
  CalendarClock,
  Database,
  HardDrive,
  History,
  ListChecks,
  ShieldCheck,
} from "lucide-react";

export const tabMeta: Record<string, { title: string; hint: string; icon: ReactNode }> = {
  dashboard: { title: "仪表盘", hint: "查看备份任务和最近运行状态", icon: <ShieldCheck /> },
  sources: { title: "数据源", hint: "配置 MySQL 和 PostgreSQL 连接", icon: <Database /> },
  targets: { title: "备份目标", hint: "配置 SSH 远端备份服务器", icon: <HardDrive /> },
  jobs: { title: "备份任务", hint: "配置周期任务并手动触发备份", icon: <CalendarClock /> },
  runs: { title: "运行记录", hint: "查看执行结果和阶段日志", icon: <History /> },
};

export const tabs: Array<{ key: string; label: string; path: string }> = [
  { key: "dashboard", label: "仪表盘", path: "/dashboard" },
  { key: "sources", label: "数据源", path: "/sources" },
  { key: "targets", label: "备份目标", path: "/targets" },
  { key: "jobs", label: "备份任务", path: "/jobs" },
  { key: "runs", label: "运行记录", path: "/runs" },
];
