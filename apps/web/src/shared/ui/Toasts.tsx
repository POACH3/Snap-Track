import { CircleAlert, CircleCheck, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ToastContext, type ToastInput } from "./toast-context.ts";
import styles from "./Toasts.module.css";

/** Successes close on their own; errors stay until closed (docs/DESIGN.md, "Toasts"). */
const SUCCESS_MS = 4000;
const MAX_VISIBLE = 3;

interface Toast extends ToastInput {
  id: number;
}

/** Holds the toasts for the whole app and shows them above everything, newest on top. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const show = useCallback((toast: ToastInput) => {
    const id = nextId.current++;
    setToasts((current) => [{ ...toast, id }, ...current].slice(0, MAX_VISIBLE));
  }, []);
  const close = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={styles.stack}>
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onClose={() => {
              close(toast.id);
            }}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (toast.kind !== "success" || paused) return;
    const timer = setTimeout(onClose, SUCCESS_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [toast.kind, paused, onClose]);

  const Icon = toast.kind === "success" ? CircleCheck : CircleAlert;
  return (
    // Hover or focus pauses the timer. A toast never takes focus itself.
    <div
      className={styles.toast}
      role={toast.kind === "error" ? "alert" : "status"}
      onMouseEnter={() => {
        setPaused(true);
      }}
      onMouseLeave={() => {
        setPaused(false);
      }}
      onFocus={() => {
        setPaused(true);
      }}
      onBlur={() => {
        setPaused(false);
      }}
    >
      <Icon className={toast.kind === "success" ? styles.success : styles.error} size={18} aria-hidden />
      <p className={styles.text}>
        <strong className={styles.title}>{toast.title}</strong>
        {toast.detail !== undefined && <> {toast.detail}</>}
      </p>
      <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
