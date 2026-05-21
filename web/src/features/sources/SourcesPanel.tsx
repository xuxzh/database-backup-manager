import { useRef, useState } from "react";
import type { FormEvent } from "react";
import type { DatabaseConnection, TestDatabaseConnectionResult } from "@/types/api";
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
import { sourceToFormValue } from "./sourceForm";
import { validatePort } from "@/shared/utils/validators";
import { errorMessage } from "@/shared/utils/error";

type SubmitResult = Promise<boolean>;
type TestSourceResult = Promise<TestDatabaseConnectionResult>;
const defaultPorts: Record<string, string> = {
  mysql: "3306",
  postgres: "5432",
};

export function SourcesPanel({
  isSubmitting,
  items,
  onDelete,
  onTest,
  onSubmit,
}: {
  isSubmitting: boolean;
  items: DatabaseConnection[];
  onDelete: (source: DatabaseConnection) => void;
  onTest: (form: FormData) => TestSourceResult;
  onSubmit: (event: FormEvent<HTMLFormElement>, source: DatabaseConnection | null) => SubmitResult;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<DatabaseConnection | null>(null);
  const [dbType, setDbType] = useState("mysql");
  const [port, setPort] = useState(defaultPorts.mysql);
  const [executionMode, setExecutionMode] = useState("local");
  const [remoteAuthMethod, setRemoteAuthMethod] = useState("key");
  const [remotePort, setRemotePort] = useState("22");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [successfulTestSignature, setSuccessfulTestSignature] = useState<string | null>(null);
  const [databaseOptions, setDatabaseOptions] = useState<string[]>([]);
  const [selectedDatabaseName, setSelectedDatabaseName] = useState("");

  function sourceFormSignature(form: FormData): string {
    return JSON.stringify({
      name: form.get("name")?.toString().trim() || "",
      dbType: form.get("dbType")?.toString().trim() || "",
      host: form.get("host")?.toString().trim() || "",
      port: form.get("port")?.toString().trim() || "",
      username: form.get("username")?.toString().trim() || "",
      password: form.get("password")?.toString() || "",
      executionMode: form.get("executionMode")?.toString().trim() || "local",
      remoteHost: form.get("remoteHost")?.toString().trim() || "",
      remotePort: form.get("remotePort")?.toString().trim() || "",
      remoteUsername: form.get("remoteUsername")?.toString().trim() || "",
      remoteAuthMethod: form.get("remoteAuthMethod")?.toString().trim() || "",
      remoteSecret: form.get("remoteSecret")?.toString() || "",
      remoteToolPath: form.get("remoteToolPath")?.toString().trim() || "",
      remoteWorkingDir: form.get("remoteWorkingDir")?.toString().trim() || "",
    });
  }

  function clearSuccessfulTest() {
    setSuccessfulTestSignature(null);
    setTestMessage("");
  }

  function handleFormChange(event: FormEvent<HTMLFormElement>) {
    if ((event.target as HTMLInputElement | HTMLSelectElement).name === "databaseName") return;
    clearSuccessfulTest();
  }

  function validateForm(form: FormData, requireSecrets = false): boolean {
    const errors: Record<string, string> = {};
    const port = Number(form.get("port"));
    const portResult = validatePort(port);
    if (!portResult.valid) errors.port = portResult.message!;
    if (!form.get("name")?.toString().trim()) errors.name = "名称不能为空";
    if (!form.get("host")?.toString().trim()) errors.host = "主机不能为空";
    if (!form.get("username")?.toString().trim()) errors.username = "用户名不能为空";
    if ((requireSecrets || !editingSource) && !form.get("password")?.toString().trim()) {
      errors.password = "密码不能为空";
    }
    if (form.get("executionMode") === "remoteSsh") {
      const remotePort = Number(form.get("remotePort"));
      const remotePortResult = validatePort(remotePort);
      if (!remotePortResult.valid) errors.remotePort = remotePortResult.message!;
      if (!form.get("remoteHost")?.toString().trim()) errors.remoteHost = "SSH 主机不能为空";
      if (!form.get("remoteUsername")?.toString().trim()) errors.remoteUsername = "SSH 用户不能为空";
      const authMethodChanged = editingSource?.remoteAuthMethod !== form.get("remoteAuthMethod");
      const modeChangedToRemote = editingSource?.executionMode !== "remoteSsh";
      if (
        (requireSecrets || modeChangedToRemote || authMethodChanged) &&
        !form.get("remoteSecret")?.toString().trim()
      ) {
        errors.remoteSecret = "SSH 密钥或密码不能为空";
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleDbTypeChange(nextDbType: string) {
    setDbType(nextDbType);
    setPort(defaultPorts[nextDbType] ?? port);
    clearSuccessfulTest();
  }

  function resetDialog(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setEditingSource(null);
      setFieldErrors({});
      setGlobalError("");
      clearSuccessfulTest();
      setDbType("mysql");
      setPort(defaultPorts.mysql);
      setExecutionMode("local");
      setRemoteAuthMethod("key");
      setRemotePort("22");
      setDatabaseOptions([]);
      setSelectedDatabaseName("");
    }
  }

  function openCreateDialog() {
    setEditingSource(null);
    setDbType("mysql");
    setPort(defaultPorts.mysql);
    setExecutionMode("local");
    setRemoteAuthMethod("key");
    setRemotePort("22");
    setDatabaseOptions([]);
    setSelectedDatabaseName("");
    setOpen(true);
  }

  function openEditDialog(source: DatabaseConnection) {
    setEditingSource(source);
    setDbType(source.dbType);
    setPort(String(source.port));
    setExecutionMode(source.executionMode);
    setRemoteAuthMethod(source.remoteAuthMethod || "key");
    setRemotePort(String(source.remotePort || 22));
    setFieldErrors({});
    setGlobalError("");
    clearSuccessfulTest();
    const savedDatabaseName = source.databaseName || "";
    setDatabaseOptions(savedDatabaseName ? [savedDatabaseName] : []);
    setSelectedDatabaseName(savedDatabaseName);
    setOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): SubmitResult {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setGlobalError("");
    if (!validateForm(form)) return false;
    if (sourceFormSignature(form) !== successfulTestSignature) {
      setGlobalError("请先测试连接，确认连接成功后再保存。");
      return false;
    }
    const ok = await onSubmit(event, editingSource);
    if (ok) resetDialog(false);
    return ok;
  }

  const editingValue = editingSource ? sourceToFormValue(editingSource) : null;
  const isEditing = Boolean(editingSource);

  async function handleTestConnection() {
    if (!formRef.current) return;
    const form = new FormData(formRef.current);
    setGlobalError("");
    setTestMessage("");
    if (!validateForm(form, true)) return;
    setIsTesting(true);
    try {
      const result = await onTest(form);
      const databases = result.databases;
      const currentDatabase = form.get("databaseName")?.toString().trim() || selectedDatabaseName;
      const nextDatabase = databases.includes(currentDatabase) ? currentDatabase : databases[0] || "";
      setDatabaseOptions(databases);
      setSelectedDatabaseName(nextDatabase);
      setSuccessfulTestSignature(sourceFormSignature(form));
      setTestMessage("连接测试成功，可以保存数据源。");
    } catch (testError) {
      setGlobalError(errorMessage(testError));
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <section className="panel">
      <DataTable
        emptyText="暂无数据源"
        title="数据源列表"
        description="配置 MySQL / PostgreSQL 连接信息。默认由管理台本机执行备份工具。"
        action={
          <Button type="button" onClick={openCreateDialog} disabled={isSubmitting}>
            新建数据源
          </Button>
        }
        headers={["名称", "类型", "主机", "端口", "用户", "执行位置", "默认数据库", "操作"]}
        rows={items.map((item) => ({
          key: item.id,
          cells: [
            <span className="font-medium">{item.name}</span>,
            <Badge variant="secondary">{item.dbType}</Badge>,
            item.host,
            String(item.port),
            item.username,
            item.executionMode === "remoteSsh" ? "数据库服务器" : "管理台本机",
            item.databaseName || "未设置",
            <div className="action-cell">
              <IconButton icon="edit" label="编辑数据源" disabled={isSubmitting} onClick={() => openEditDialog(item)} />
              <IconButton label="删除数据源" disabled={isSubmitting} onClick={() => onDelete(item)} />
            </div>,
          ],
        }))}
      />

      <Dialog open={open} onOpenChange={resetDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{isEditing ? "编辑数据源" : "新建数据源"}</DialogTitle>
            <DialogDescription>数据库密码会由后端加密保存；编辑时留空表示沿用原密码。</DialogDescription>
          </DialogHeader>
          {testMessage && (
            <Alert className="mb-4" variant="success">{testMessage}</Alert>
          )}
          {globalError && (
            <Alert className="mb-4" variant="destructive">{globalError}</Alert>
          )}
          <form
            className="form-grid"
            id="source-form"
            ref={formRef}
            onSubmit={handleSubmit}
            onChange={handleFormChange}
          >
            <Field label="名称">
              <Input name="name" placeholder="生产库" defaultValue={editingValue?.name || ""} required />
              {fieldErrors.name && <p className="field-error">{fieldErrors.name}</p>}
            </Field>
            <Field label="类型">
              <Select name="dbType" value={dbType} onValueChange={handleDbTypeChange}>
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
              <Input name="host" placeholder="127.0.0.1" defaultValue={editingValue?.host || ""} required />
              {fieldErrors.host && <p className="field-error">{fieldErrors.host}</p>}
            </Field>
            <Field label="端口">
              <Input
                name="port"
                type="number"
                min="1"
                max="65535"
                value={port}
                onChange={(event) => {
                  setPort(event.target.value);
                  clearSuccessfulTest();
                }}
                required
              />
              {fieldErrors.port && <p className="field-error">{fieldErrors.port}</p>}
            </Field>
            <Field label="用户名">
              <Input name="username" placeholder="backup" defaultValue={editingValue?.username || ""} required />
              {fieldErrors.username && <p className="field-error">{fieldErrors.username}</p>}
            </Field>
            <Field label="密码">
              <Input
                name="password"
                type="password"
                placeholder={isEditing ? "留空表示不修改" : "数据库密码"}
                autoComplete="new-password"
                required={!isEditing}
              />
              {fieldErrors.password && <p className="field-error">{fieldErrors.password}</p>}
            </Field>
            <Field label="默认数据库">
              <Select
                key={databaseOptions.join("\0")}
                name="databaseName"
                value={selectedDatabaseName}
                onValueChange={setSelectedDatabaseName}
                disabled={databaseOptions.length === 0}
              >
                <SelectTrigger aria-label="默认数据库">
                  <SelectValue placeholder="测试连接后可选择" />
                </SelectTrigger>
                <SelectContent>
                  {databaseOptions.map((databaseName) => (
                    <SelectItem key={databaseName} value={databaseName}>{databaseName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="备份执行位置">
              <Select
                name="executionMode"
                value={executionMode}
                onValueChange={(nextExecutionMode) => {
                  setExecutionMode(nextExecutionMode);
                  clearSuccessfulTest();
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">管理台本机执行</SelectItem>
                  <SelectItem value="remoteSsh">数据库服务器执行</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {executionMode === "remoteSsh" && (
              <>
                <Field label="SSH 主机">
                  <Input name="remoteHost" placeholder="数据库服务器地址" defaultValue={editingValue?.remoteHost || ""} required />
                  {fieldErrors.remoteHost && <p className="field-error">{fieldErrors.remoteHost}</p>}
                </Field>
                <Field label="SSH 端口">
                  <Input
                    name="remotePort"
                    type="number"
                    min="1"
                    max="65535"
                    value={remotePort}
                    onChange={(event) => {
                      setRemotePort(event.target.value);
                      clearSuccessfulTest();
                    }}
                    required
                  />
                  {fieldErrors.remotePort && <p className="field-error">{fieldErrors.remotePort}</p>}
                </Field>
                <Field label="SSH 用户">
                  <Input name="remoteUsername" placeholder="backup" defaultValue={editingValue?.remoteUsername || ""} required />
                  {fieldErrors.remoteUsername && <p className="field-error">{fieldErrors.remoteUsername}</p>}
                </Field>
                <Field label="认证方式">
                  <Select
                    name="remoteAuthMethod"
                    value={remoteAuthMethod}
                    onValueChange={(nextRemoteAuthMethod) => {
                      setRemoteAuthMethod(nextRemoteAuthMethod);
                      clearSuccessfulTest();
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="key">私钥</SelectItem>
                      <SelectItem value="password">密码</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={remoteAuthMethod === "password" ? "SSH 密码" : "SSH 私钥"}>
                  <Input
                    name="remoteSecret"
                    type={remoteAuthMethod === "password" ? "password" : "text"}
                    placeholder={isEditing ? "留空表示不修改" : remoteAuthMethod === "password" ? "SSH 登录密码" : "私钥内容"}
                    required={!isEditing || editingSource?.executionMode !== "remoteSsh" || editingSource?.remoteAuthMethod !== remoteAuthMethod}
                  />
                  {fieldErrors.remoteSecret && <p className="field-error">{fieldErrors.remoteSecret}</p>}
                </Field>
                <Field label="远端工具路径">
                  <Input
                    name="remoteToolPath"
                    placeholder={dbType === "mysql" ? "默认 mysqldump" : "默认 pg_dump"}
                    defaultValue={editingValue?.remoteToolPath || ""}
                  />
                </Field>
                <Field label="远端工作目录">
                  <Input name="remoteWorkingDir" placeholder="可选" defaultValue={editingValue?.remoteWorkingDir || ""} />
                </Field>
              </>
            )}
          </form>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                取消
              </Button>
            </DialogClose>
            <Button type="button" variant="secondary" disabled={isSubmitting || isTesting} onClick={handleTestConnection}>
              {isTesting ? "测试中..." : "测试连接"}
            </Button>
            <Button type="submit" form="source-form" disabled={isSubmitting || successfulTestSignature === null}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
