import { useState } from "react";
import type { FormEvent } from "react";
import type { DatabaseConnection } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
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
import { validatePort } from "@/shared/utils/validators";

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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState("");

  function validateForm(form: FormData): boolean {
    const errors: Record<string, string> = {};
    const port = Number(form.get("port"));
    const portResult = validatePort(port);
    if (!portResult.valid) errors.port = portResult.message!;
    if (!form.get("name")?.toString().trim()) errors.name = "名称不能为空";
    if (!form.get("host")?.toString().trim()) errors.host = "主机不能为空";
    if (!form.get("username")?.toString().trim()) errors.username = "用户名不能为空";
    if (!form.get("password")?.toString().trim()) errors.password = "密码不能为空";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): SubmitResult {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setGlobalError("");
    if (!validateForm(form)) return false;
    const ok = await onSubmit(event);
    if (ok) setOpen(false);
    return ok;
  }

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
          {globalError && (
            <Alert className="mb-4" variant="destructive">{globalError}</Alert>
          )}
          <form
            className="form-grid"
            id="create-source-form"
            onSubmit={handleSubmit}
          >
            <Field label="名称">
              <Input name="name" placeholder="生产库" required />
              {fieldErrors.name && <p className="field-error">{fieldErrors.name}</p>}
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
              {fieldErrors.host && <p className="field-error">{fieldErrors.host}</p>}
            </Field>
            <Field label="端口">
              <Input name="port" type="number" defaultValue="3306" required />
              {fieldErrors.port && <p className="field-error">{fieldErrors.port}</p>}
            </Field>
            <Field label="用户名">
              <Input name="username" placeholder="backup" required />
              {fieldErrors.username && <p className="field-error">{fieldErrors.username}</p>}
            </Field>
            <Field label="密码">
              <Input name="password" type="password" placeholder="数据库密码" autoComplete="new-password" required />
              {fieldErrors.password && <p className="field-error">{fieldErrors.password}</p>}
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