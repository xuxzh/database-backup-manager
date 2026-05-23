import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

export function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="field">
      <Label>{label}</Label>
      {children}
    </div>
  );
}