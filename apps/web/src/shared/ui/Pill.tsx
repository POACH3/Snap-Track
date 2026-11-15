import type { ReactNode } from "react";
import styles from "./Pill.module.css";

interface PillProps {
  /** plain: neutral status. accent: highlighted. warning: needs attention (docs/DESIGN.md, "Components"). */
  variant?: "plain" | "accent" | "warning";
  children: ReactNode;
}

/** Status and category pill: 26px, fully round, 13px / 500. */
export function Pill({ variant = "plain", children }: PillProps) {
  return <span className={`${styles.pill} ${styles[variant]}`}>{children}</span>;
}
