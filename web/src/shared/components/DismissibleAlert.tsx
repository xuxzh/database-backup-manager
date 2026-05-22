import { useEffect, useState, type ReactNode } from "react";
import { AlertCircle, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DismissibleAlert({
  className,
  message,
  children,
}: {
  className?: string;
  message: string;
  children?: ReactNode;
}) {
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    setIsDismissed(false);
  }, [message]);

  if (!message || isDismissed) return null;

  return (
    <Alert className={cn("persistent-alert", className)} variant="destructive">
      <AlertCircle className="size-4" />
      <span>{children || message}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="persistent-alert-close"
        aria-label="关闭错误提示"
        onClick={() => setIsDismissed(true)}
      >
        <X className="size-4" />
      </Button>
    </Alert>
  );
}
