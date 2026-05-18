import { useState, type ReactNode } from "react";
import { tabMeta, tabs } from "./navigation";
import { LogOut, PanelLeft, RefreshCw, Server } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export { tabs, tabMeta };

export function AppShell({
  activeTab,
  isLoading,
  notice,
  error,
  onTabChange,
  onLogout,
  onRefresh,
  children,
}: {
  activeTab: string;
  isLoading: boolean;
  notice: string;
  error: string;
  onTabChange: (tab: string) => void;
  onLogout: () => void;
  onRefresh: () => void;
  children: ReactNode;
}) {
  const currentTabMeta = tabMeta[activeTab as keyof typeof tabMeta];
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  function handleTabChange(tab: string) {
    onTabChange(tab);
    setIsMobileNavOpen(false);
  }

  function handleLogout() {
    setIsMobileNavOpen(false);
    onLogout();
  }

  function renderNavigation() {
    return (
      <>
        <div className="brand">
          <div className="brand-mark">
            <Server className="size-5" />
          </div>
          <div>
            <h1>数据库备份管理台</h1>
            <p>Backup Manager</p>
          </div>
        </div>
        <nav aria-label="主导航">
          {tabs.map((tab) => (
            <Button
              className="nav-button"
              data-active={tab.key === activeTab}
              key={tab.key}
              type="button"
              variant="ghost"
              onClick={() => handleTabChange(tab.key)}
            >
              <span className="nav-icon">{tabMeta[tab.key].icon}</span>
              {tab.label}
            </Button>
          ))}
        </nav>
        <Separator className="bg-sidebar-border" />
        <Button className="logout-button" type="button" variant="ghost" onClick={handleLogout}>
          <LogOut className="size-4" />
          退出登录
        </Button>
      </>
    );
  }

  return (
    <TooltipProvider>
      <main className="app-shell">
        <aside className="sidebar">{renderNavigation()}</aside>

        <section className="workspace">
          <header className="topbar">
            <div className="topbar-main">
              <Dialog open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DialogTrigger asChild>
                      <Button className="mobile-menu-button" type="button" variant="outline" size="icon" aria-label="打开导航菜单">
                        <PanelLeft className="size-4" />
                      </Button>
                    </DialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>打开导航菜单</TooltipContent>
                </Tooltip>
                <DialogContent className="mobile-nav-drawer" aria-describedby={undefined}>
                  <DialogTitle className="sr-only">导航菜单</DialogTitle>
                  {renderNavigation()}
                </DialogContent>
              </Dialog>
              <div className="topbar-title">
                <div className="eyebrow">
                  <span className="topbar-icon">{currentTabMeta?.icon}</span>
                  自部署备份控制台
                </div>
                <h2>{currentTabMeta?.title}</h2>
                <p>{currentTabMeta?.hint}</p>
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
                  <RefreshCw className={isLoading ? "size-4 animate-spin" : "size-4"} />
                  {isLoading ? "刷新中" : "刷新"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>重新加载数据源、任务和运行记录</TooltipContent>
            </Tooltip>
          </header>

          {(notice || error) && (
            <Alert className="mb-4" variant={error ? "destructive" : "success"}>
              {error || notice}
            </Alert>
          )}

          {children}
        </section>
      </main>
    </TooltipProvider>
  );
}
