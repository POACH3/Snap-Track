import type { ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * primary: the one main action on a screen. secondary: low emphasis beside it (Cancel, Back,
   * other ways to do the same thing). ghost: low emphasis in a toolbar (docs/DESIGN.md).
   */
  variant?: "primary" | "secondary" | "ghost";
  /** While the action runs the button keeps its size and label, and is disabled. */
  busy?: boolean;
  fullWidth?: boolean;
}

export function Button({
  variant = "primary",
  busy = false,
  fullWidth = false,
  disabled,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = [styles.button, styles[variant], fullWidth ? styles.fullWidth : undefined, className]
    .filter(Boolean)
    .join(" ");
  return (
    <button {...rest} type={type} className={classes} disabled={disabled === true || busy} aria-busy={busy} />
  );
}
