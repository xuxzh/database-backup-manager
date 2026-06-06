import type { FormEvent } from "react";
import { LogIn, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/shared/components/Field";
import { DismissibleAlert } from "@/shared/components/DismissibleAlert";

export function LoginPage({
  error,
  isSubmitting,
  onSubmit,
}: {
  error: string;
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="login-page">
      <Card className="login-panel">
        <CardHeader>
          <div className="login-mark">
            <ShieldCheck className="size-6" />
          </div>
          <CardTitle className="text-2xl">数据库备份管理台</CardTitle>
          <CardDescription>登录后管理数据源、备份目标和定时任务。</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="stack-form" onSubmit={onSubmit}>
            <Field label="用户名">
              <Input name="username" autoComplete="username" defaultValue="admin" required />
            </Field>
            <Field label="密码">
              <Input
                name="password"
                type="password"
                autoComplete="current-password"
                defaultValue="admin123"
                required
              />
            </Field>
            <Button type="submit" disabled={isSubmitting}>
              <LogIn aria-hidden="true" />
              {isSubmitting ? "登录中..." : "登录"}
            </Button>
          </form>
          <DismissibleAlert className="mt-4" message={error} />
        </CardContent>
      </Card>
    </main>
  );
}
