"use client";

import { Button } from "./Button";
import { Dialog } from "./Dialog";

interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} title={title} description={description}>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onCancel} variant="ghost">
          {cancelLabel}
        </Button>
        <Button onClick={onConfirm} variant={destructive ? "danger" : "primary"} autoFocus>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
