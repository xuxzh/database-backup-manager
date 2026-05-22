import { useRef, useState } from "react";
import type { FormEvent } from "react";
import type { BackupTarget } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { targetToFormValue } from "./targetForm";
import { validatePort, validateRequiredString } from "@/shared/utils/validators";
import { errorMessage } from "@/shared/utils/error";
import { DismissibleAlert } from "@/shared/components/DismissibleAlert";
import { toast } from "sonner";

type SubmitResult = Promise<boolean>;

export function TargetsPanel({
  isSubmitting,
  items,
  onDelete,
  onTest,
  onSubmit,
}: {
  isSubmitting: boolean;
  items: BackupTarget[];
  onDelete: (target: BackupTarget) => void;
  onTest: (form: FormData) => SubmitResult;
  onSubmit: (event: FormEvent<HTMLFormElement>, target: BackupTarget | null) => SubmitResult;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<BackupTarget | null>(null);
  const [authMethod, setAuthMethod] = useState("key");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState("");
  const [isTesting, setIsTesting] = useState(false);

  function validateForm(form: FormData, requireSecrets = false): boolean {
    const errors: Record<string, string> = {};
    const port = Number(form.get("port"));
    const portResult = validatePort(port);
    if (!portResult.valid) errors.port = portResult.message!;
    const nameResult = validateRequiredString(form.get("name")?.toString() || "", "名称");
    if (!nameResult.valid) errors.name = nameResult.message!;
    const hostResult = validateRequiredString(form.get("host")?.toString() || "", "主机");
    if (!hostResult.valid) errors.host = hostResult.message!;
    const usernameResult = validateRequiredString(form.get("username")?.toString() || "", "用户名");
    if (!usernameResult.valid) errors.username = usernameResult.message!;
    const authMethodChanged = editingTarget?.authMethod !== form.get("authMethod");
    if (requireSecrets || !editingTarget || authMethodChanged) {
      const secretResult = validateRequiredString(form.get("secret")?.toString() || "", "密钥或密码");
      if (!secretResult.valid) errors.secret = secretResult.message!;
    }
    const baseDirResult = validateRequiredString(form.get("baseDir")?.toString() || "", "远端目录");
    if (!baseDirResult.valid) errors.baseDir = baseDirResult.message!;
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function resetDialog(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setEditingTarget(null);
      setAuthMethod("key");
      setFieldErrors({});
      setGlobalError("");
    }
  }

  function openCreateDialog() {
    setEditingTarget(null);
    setAuthMethod("key");
    setFieldErrors({});
    setGlobalError("");
    setOpen(true);
  }

  function openEditDialog(target: BackupTarget) {
    setEditingTarget(target);
    setAuthMethod(target.authMethod);
    setFieldErrors({});
    setGlobalError("");
    setOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): SubmitResult {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setGlobalError("");
    if (!validateForm(form)) return false;
    const ok = await onSubmit(event, editingTarget);
    if (ok) resetDialog(false);
    return ok;
  }

  const editingValue = editingTarget ? targetToFormValue(editingTarget) : null;
  const isEditing = Boolean(editingTarget);

  async function handleTestTarget() {
    if (!formRef.current) return;
    const form = new FormData(formRef.current);
    setGlobalError("");
    if (!validateForm(form, true)) return;
    setIsTesting(true);
    try {
      await onTest(form);
      toast.success("备份目标测试成功，可以保存目标。");
    } catch (testError) {
      setGlobalError(errorMessage(testError));
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <section className="panel">
      <DataTable
        emptyText="暂无备份目标"
        title="备份目标列表"
        description="当前支持 SSH 远端目标，可使用密钥或密码认证。"
        action={
          <Button type="button" onClick={openCreateDialog} disabled={isSubmitting}>
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
            <div className="action-cell">
              <IconButton icon="edit" label="编辑备份目标" disabled={isSubmitting} onClick={() => openEditDialog(item)} />
              <IconButton label="删除备份目标" disabled={isSubmitting} onClick={() => onDelete(item)} />
            </div>,
          ],
        }))}
      />

      <Dialog open={open} onOpenChange={resetDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{isEditing ? "编辑备份目标" : "新建备份目标"}</DialogTitle>
            <DialogDescription>当前支持 SSH 远端目标；编辑时密钥或密码留空表示沿用原值。</DialogDescription>
          </DialogHeader>
          <DismissibleAlert className="mb-4" message={globalError} />
          <form
            className="form-grid"
            id="target-form"
            ref={formRef}
            onSubmit={handleSubmit}
          >
            <Field label="名称">
              <Input name="name" placeholder="远端备份机" defaultValue={editingValue?.name || ""} required />
              {fieldErrors.name && <p className="field-error">{fieldErrors.name}</p>}
            </Field>
            <Field label="SSH 主机">
              <Input name="host" placeholder="10.0.0.8" defaultValue={editingValue?.host || ""} required />
              {fieldErrors.host && <p className="field-error">{fieldErrors.host}</p>}
            </Field>
            <Field label="端口">
              <Input name="port" type="number" min="1" max="65535" defaultValue={editingValue?.port || 22} required />
              {fieldErrors.port && <p className="field-error">{fieldErrors.port}</p>}
            </Field>
            <Field label="SSH 用户名">
              <Input name="username" placeholder="backup" defaultValue={editingValue?.username || ""} required />
              {fieldErrors.username && <p className="field-error">{fieldErrors.username}</p>}
            </Field>
            <Field label="认证方式">
              <Select
                name="authMethod"
                value={authMethod}
                onValueChange={(value) => {
                  setAuthMethod(value);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="key">SSH Key</SelectItem>
                  <SelectItem value="password">密码</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={authMethod === "key" ? "SSH 私钥" : "登录密码"}>
              {authMethod === "key" ? (
                <Textarea
                  name="secret"
                  placeholder={isEditing ? "留空表示不修改" : "粘贴 SSH 私钥"}
                  autoComplete="off"
                  required={!isEditing || editingTarget?.authMethod !== authMethod}
                />
              ) : (
                <Input
                  name="secret"
                  type="password"
                  placeholder={isEditing ? "留空表示不修改" : "登录密码"}
                  autoComplete="new-password"
                  required={!isEditing || editingTarget?.authMethod !== authMethod}
                />
              )}
              {fieldErrors.secret && <p className="field-error">{fieldErrors.secret}</p>}
            </Field>
            <Field label="远端目录">
              <Input name="baseDir" placeholder="~/backups" defaultValue={editingValue?.baseDir || "~/backups"} required />
              {fieldErrors.baseDir && <p className="field-error">{fieldErrors.baseDir}</p>}
            </Field>
          </form>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                取消
              </Button>
            </DialogClose>
            <Button type="button" variant="secondary" disabled={isSubmitting || isTesting} onClick={handleTestTarget}>
              {isTesting ? "测试中..." : "测试目标"}
            </Button>
            <Button type="submit" form="target-form" disabled={isSubmitting}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
