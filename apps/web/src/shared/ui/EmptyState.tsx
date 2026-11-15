import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

interface EmptyStateProps {
  title: string;
  children?: ReactNode;
  /** The action that fills the list (docs/DESIGN.md, "Feedback"). */
  action?: ReactNode;
}

/** An empty list or a section not built yet: one sentence, plus the action that fills it. */
export function EmptyState({ title, children, action }: EmptyStateProps) {
  return (
    <section className={styles.empty}>
      <h3>{title}</h3>
      {children !== undefined && <p className={styles.text}>{children}</p>}
      {action !== undefined && <div className={styles.action}>{action}</div>}
    </section>
  );
}
