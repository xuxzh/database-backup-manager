import { useState } from "react";
import type { FormEvent } from "react";
import type { BackupTarget } from "@/types/api";
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

export function TargetsPanel({
  isSubmitting,
  items,
  onDelete,
  onSubmit,
}: {
  isSubmitting: boolean;
  items: BackupTarget[];
  onDelete: (target: BackupTarget) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => SubmitResult;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="panel">
      <DataTable
        emptyText="暂无备份目标"
        title="备份目标列表"
        description="当前支持 SSH 远端目标，可使用密钥或密码认证。"
        action={
          <Button type="button" onClick={() => setOpen(true)} disabled={isSubmitting}>
            新建备份目标
          </Button>
        }
        headers={["名称", "类型", "主机", "端口", "用户", "远端目录", "操作"]}
        rows={items.map((item) => ({
          key: item.id,
          cells: [
            <span className="font-medium">{item.name}</span>,
            <Badge variant="secondary">{item.targetType}</Badge>,
            item.host,
            String(item.port),
            item.username,
            item.baseDir,
            <IconButton label="删除备份目标" disabled={isSubmitting} onClick={() => onDelete(item)} />,
          ],
        }))}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>新建备份目标</DialogTitle>
            <DialogDescription>当前支持 SSH 远端目标，可使用密钥或密码认证。</DialogDescription>
          </DialogHeader>
          <form
            className="form-grid"
            id="create-target-form"
            onSubmit={async (event) => {
              const ok = await onSubmit(event);
              if (ok) setOpen(false);
            }}
          >
            <Field label="名称">
              <Input name="name" placeholder="远端备份机" required />
            </Field>
            <Field label="SSH 主机">
              <Input name="host" placeholder="10.0.0.8" required />
            </Field>
            <Field label="端口">
              <Input name="port" type="number" defaultValue="22" required />
            </Field>
            <Field label="SSH 用户名">
              <Input name="username" placeholder="backup" required />
            </Field>
            <Field label="认证方式">
              <Select name="authMethod" defaultValue="key">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="key">SSH Key</SelectItem>
                  <SelectItem value="password">密码</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="密钥或密码">
              <Input name="secret" type="password" placeholder="私钥或密码" autoComplete="new-password" required />
            </Field>
            <Field label="远端目录">
              <Input name="baseDir" placeholder="/data/backups" defaultValue="/data/backups" required />
            </Field>
          </form>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                取消
              </Button>
            </DialogClose>
            <Button type="submit" form="create-target-form" disabled={isSubmitting}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}