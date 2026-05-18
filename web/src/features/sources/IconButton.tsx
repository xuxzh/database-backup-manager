import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Pencil, Trash2 } from "lucide-react";

export function IconButton({
  disabled,
  icon = "delete",
  label,
  onClick,
}: {
  disabled?: boolean;
  icon?: "delete" | "edit";
  label: string;
  onClick: () => void;
}) {
  const Icon = icon === "edit" ? Pencil : Trash2;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" size="icon" variant="outline" disabled={disabled} onClick={onClick} aria-label={label}>
          <Icon className={icon === "delete" ? "size-4 text-destructive" : "size-4"} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
