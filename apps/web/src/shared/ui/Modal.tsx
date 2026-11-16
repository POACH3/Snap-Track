import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./Modal.module.css";

interface ModalProps {
  open: boolean;
  title: string;
  /** Close button, Escape, or a tap on the scrim. Ignored while `busy`. */
  onClose: () => void;
  /** A save is running: the modal can't be closed (docs/DESIGN.md, "Modals"). */
  busy?: boolean;
  size?: "small" | "medium" | "large";
  /** Buttons, right-aligned: the secondary first, then the main one. */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * A window over the page (docs/DESIGN.md, "Overlays"). Built on `<dialog>`, which traps focus,
 * closes on Escape and returns focus to the control that opened it.
 */
export function Modal({ open, title, onClose, busy = false, size = "small", actions, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`${styles.modal} ${styles[size]}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        // A click on the dialog itself, outside the panel, is a click on the scrim.
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      {open && (
        <div className={styles.panel}>
          <header className={styles.header}>
            <h3 id={titleId} className={styles.title}>
              {title}
            </h3>
            <button
              type="button"
              className={styles.close}
              aria-label="Close"
              disabled={busy}
              onClick={onClose}
            >
              <X size={18} aria-hidden />
            </button>
          </header>
          <div className={styles.body}>{children}</div>
          {actions !== undefined && <footer className={styles.actions}>{actions}</footer>}
        </div>
      )}
    </dialog>
  );
}
