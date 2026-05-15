import type { DashboardStats } from "@/types/api";
import { Database, HardDrive, CalendarClock, ShieldCheck, History, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RunSummary } from "@/shared/components/RunSummary";
import { EmptyState } from "@/shared/components/EmptyState";
import { Button } from "@/components/ui/button";

export function DashboardPanel({
  dashboard,
  onViewRun,
}: {
  dashboard: DashboardStats | null;
  onViewRun?: (runId: string) => void;
}) {
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

      {dashboard?.latestRun && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>最近运行</CardTitle>
                <CardDescription>最近一次备份执行的状态和阶段</CardDescription>
              </div>
              {onViewRun && (
                <Button type="button" variant="ghost" size="sm" onClick={() => onViewRun(dashboard.latestRun!.id)}>
                  查看详情
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <RunSummary run={dashboard.latestRun} />
          </CardContent>
        </Card>
      )}

      {!dashboard?.latestRun && <EmptyState text="暂无运行记录" />}

      {dashboard?.todayFailedCount !== undefined && dashboard.todayFailedCount > 0 && (
        <Card className="border-destructive/50">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" />
              <CardTitle className="text-destructive">今日失败</CardTitle>
            </div>
            <CardDescription>最近 {dashboard.todayFailedCount} 次备份执行失败，请检查运行记录。</CardDescription>
          </CardHeader>
        </Card>
      )}
    </section>
  );
}