import type { FormEvent } from "react";
import type { BackupTarget, DatabaseConnection } from "@/types/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/shared/components/EmptyState";
import { UploadCloud } from "lucide-react";

export function ManualUploadsPanel({
  sources,
  targets,
  isSubmitting,
  onSubmit,
}: {
  sources: DatabaseConnection[];
  targets: BackupTarget[];
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
}) {
  return (
    <section className="panel">
      <Card className="data-table-card">
        <CardHeader className="data-table-header">
          <div className="min-w-0">
            <CardTitle>手动上传</CardTitle>
            <CardDescription>上传已有数据库备份包，并转存到已配置的备份服务器。</CardDescription>
          </div>
          <Badge variant="secondary">manual</Badge>
        </CardHeader>
        <CardContent>
          {sources.length && targets.length ? (
            <form className="form-grid manual-upload-form" onSubmit={onSubmit}>
              <div className="cron-field">
                <Label htmlFor="manual-backup-target">备份目标</Label>
                <Select name="backupTargetId" required>
                  <SelectTrigger id="manual-backup-target" aria-label="备份目标">
                    <SelectValue placeholder="选择备份目标" />
                  </SelectTrigger>
                  <SelectContent>
                    {targets.map((target) => (
                      <SelectItem key={target.id} value={target.id}>
                        {target.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="cron-field">
                <Label htmlFor="manual-source">数据源</Label>
                <Select name="sourceId" required>
                  <SelectTrigger id="manual-source" aria-label="数据源">
                    <SelectValue placeholder="选择数据源" />
                  </SelectTrigger>
                  <SelectContent>
                    {sources.map((source) => (
                      <SelectItem key={source.id} value={source.id}>
                        {source.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="cron-field">
                <Label htmlFor="manual-database-name">数据库名</Label>
                <Input id="manual-database-name" name="databaseName" placeholder="app" required />
              </div>

              <div className="cron-field manual-upload-file">
                <Label htmlFor="manual-upload-file">备份文件</Label>
                <Input id="manual-upload-file" name="file" type="file" required />
              </div>

              <div className="cron-field manual-upload-note">
                <Label htmlFor="manual-upload-note">备注</Label>
                <Textarea id="manual-upload-note" name="note" placeholder="例如导出机器、导出时间或工单号" />
              </div>

              <div className="form-actions">
                <Button type="submit" disabled={isSubmitting}>
                  <UploadCloud className="size-4" />
                  {isSubmitting ? "上传中" : "开始上传"}
                </Button>
              </div>
            </form>
          ) : (
            <EmptyState text={!sources.length ? "请先创建数据源，手动上传需要选择备份来源。" : "请先创建备份目标，手动上传需要一个远端存储位置。"} />
          )}
        </CardContent>
      </Card>
    </section>
  );
}
