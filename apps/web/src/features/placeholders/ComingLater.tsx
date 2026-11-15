import { EmptyState } from "../../shared/ui/EmptyState.tsx";
import styles from "./ComingLater.module.css";

/** A section in the navigation that a later stage builds (SPEC.md §11). */
export function ComingLater({ title, children }: { title: string; children: string }) {
  return (
    <div className={styles.screen}>
      <h1>{title}</h1>
      <EmptyState title="Not built yet">{children}</EmptyState>
    </div>
  );
}
