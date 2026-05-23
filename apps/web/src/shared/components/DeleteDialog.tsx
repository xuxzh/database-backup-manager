import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type DeleteTarget = { label: string; path: string; successMessage: string } | null;

export function DeleteDialog({
  isSubmitting,
  target,
  onCancel,
  onConfirm,
}: {
  isSubmitting: boolean;
  target: DeleteTarget;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认删除</DialogTitle>
          <DialogDescription>
            删除 {target?.label} 后将无法在列表中继续使用，请确认相关任务或运行记录不再依赖它。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isSubmitting}>
              取消
            </Button>
          </DialogClose>
          <Button type="button" variant="destructive" disabled={isSubmitting} onClick={onConfirm}>
            删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { DeleteTarget };