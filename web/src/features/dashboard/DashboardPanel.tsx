import type { DashboardStats } from "@/types/api";
import { Database, HardDrive, CalendarClock, ShieldCheck, History } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RunSummary } from "@/shared/components/RunSummary";
import { EmptyState } from "@/shared/components/EmptyState";

export function DashboardPanel({ dashboard }: { dashboard: DashboardStats | null }) {
  const stats = [
    { label: "数据源", value: dashboard?.sourceCount ?? 0, icon: <Database />, tone: "sky" },
    { label: "备份目标", value: dashboard?.targetCount ?? 0, icon: <HardDrive />, tone: "indigo" },
    { label: "任务", value: dashboard?.jobCount ?? 0, icon: <CalendarClock />, tone: "slate" },
    { label: "启用任务", value: dashboard?.enabledJobCount ?? 0, icon: <ShieldCheck />, tone: "emerald" },
    { label: "今日成功", value: dashboard?.todaySuccessCount ?? 0, icon: <ShieldCheck />, tone: "emerald" },
    { label: "今日失败", value: dashboard?.todayFailedCount ?? 0, icon: <History />, tone: "rose" },
  ];

  return (
    <section className="panel">
      <div className="stats-grid">
        {stats.map((item) => (
          <Card className="stat-card" data-tone={item.tone} key={item.label}>
            <CardContent className="p-4">
              <div className="stat-icon">{item.icon}</div>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>最近运行</CardTitle>
          <CardDescription>最近一次备份执行的状态和阶段</CardDescription>
        </CardHeader>
        <CardContent>
          {dashboard?.latestRun ? <RunSummary run={dashboard.latestRun} /> : <EmptyState text="暂无运行记录" />}
        </CardContent>
      </Card>
    </section>
  );
}