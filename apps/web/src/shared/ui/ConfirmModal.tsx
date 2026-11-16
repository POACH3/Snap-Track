import { Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./Button.tsx";
import { Modal } from "./Modal.tsx";

interface ConfirmModalProps {
  open: boolean;
  /** A question naming the thing: "Discard your changes?" */
  title: string;
  /** What will happen, in specifics. */
  children: ReactNode;
  /** A specific label, never "OK". */
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A question before an action (docs/DESIGN.md, "Confirm modals"). Cancel, Escape and the scrim all cancel. */
export function ConfirmModal({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      busy={busy}
      actions={
        <>
          {/* A destructive confirm opens with focus on Cancel. */}
          <Button variant="secondary" autoFocus={destructive} disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={destructive ? "danger" : "primary"} busy={busy} onClick={onConfirm}>
            {destructive && <Trash2 size={18} aria-hidden />}
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
