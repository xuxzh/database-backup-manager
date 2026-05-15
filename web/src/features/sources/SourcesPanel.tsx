import { useState } from "react";
import type { FormEvent } from "react";
import type { DatabaseConnection } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { DataTable } from "@/shared/components/DataTable";
import { Field } from "@/shared/components/Field";
import { IconButton } from "./IconButton";

type SubmitResult = Promise<boolean>;

export function SourcesPanel({
  isSubmitting,
  items,
  onDelete,
  onSubmit,
}: {
  isSubmitting: boolean;
  items: DatabaseConnection[];
  onDelete: (source: DatabaseConnection) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => SubmitResult;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="panel">
      <DataTable
        emptyText="暂无数据源"
        title="数据源列表"
        description="配置 MySQL / PostgreSQL 连接信息。密码由后端加密保存。"
        action={
          <Button type="button" onClick={() => setOpen(true)} disabled={isSubmitting}>
            新建数据源
          </Button>
        }
        headers={["名称", "类型", "主机", "端口", "用户", "默认数据库", "操作"]}
        rows={items.map((item) => ({
          key: item.id,
          cells: [
            <span className="font-medium">{item.name}</span>,
            <Badge variant="secondary">{item.dbType}</Badge>,
            item.host,
            String(item.port),
            item.username,
            item.databaseName || "未设置",
            <IconButton label="删除数据源" disabled={isSubmitting} onClick={() => onDelete(item)} />,
          ],
        }))}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>新建数据源</DialogTitle>
            <DialogDescription>数据库密码会由后端加密保存。</DialogDescription>
          </DialogHeader>
          <form
            className="form-grid"
            id="create-source-form"
            onSubmit={async (event) => {
              const ok = await onSubmit(event);
              if (ok) setOpen(false);
            }}
          >
            <Field label="名称">
              <Input name="name" placeholder="生产库" required />
            </Field>
            <Field label="类型">
              <Select name="dbType" defaultValue="mysql">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mysql">MySQL</SelectItem>
                  <SelectItem value="postgres">PostgreSQL</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="主机">
              <Input name="host" placeholder="127.0.0.1" required />
            </Field>
            <Field label="端口">
              <Input name="port" type="number" defaultValue="3306" required />
            </Field>
            <Field label="用户名">
              <Input name="username" placeholder="backup" required />
            </Field>
            <Field label="密码">
              <Input name="password" type="password" placeholder="数据库密码" autoComplete="new-password" required />
            </Field>
            <Field label="默认数据库">
              <Input name="databaseName" placeholder="可选" />
            </Field>
          </form>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                取消
              </Button>
            </DialogClose>
            <Button type="submit" form="create-source-form" disabled={isSubmitting}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}