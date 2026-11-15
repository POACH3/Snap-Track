import { createContext, useContext } from "react";

export interface ToastInput {
  kind: "success" | "error";
  /** Bold, short result: "Receipt saved." */
  title: string;
  /** Optional detail: what happened, or what to do next. */
  detail?: string;
}

export const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

/** Shows a toast: the result of an action (docs/DESIGN.md, "Toasts"). */
export function useToast(): (toast: ToastInput) => void {
  const show = useContext(ToastContext);
  if (show === null) throw new Error("useToast needs a ToastProvider above it");
  return show;
}
