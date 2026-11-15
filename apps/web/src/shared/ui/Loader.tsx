import { useEffect, useState } from "react";
import styles from "./Loader.module.css";

/** Show nothing for this long, so quick loads don't flash a skeleton (docs/DESIGN.md, "Loading"). */
const SHOW_AFTER_MS = 300;
/** After this long, also say what is loading. */
const EXPLAIN_AFTER_MS = 5000;

interface LoaderProps {
  /** Shown after 5 seconds, e.g. "Connecting to SnapTrack…". */
  label: string;
}

/** The one loading component for every wait on content (docs/DESIGN.md, "Loading"). */
export function Loader({ label }: LoaderProps) {
  const [stage, setStage] = useState<"hidden" | "skeleton" | "explained">("hidden");

  useEffect(() => {
    const show = setTimeout(() => {
      setStage("skeleton");
    }, SHOW_AFTER_MS);
    const explain = setTimeout(() => {
      setStage("explained");
    }, EXPLAIN_AFTER_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(explain);
    };
  }, []);

  if (stage === "hidden") return null;
  return (
    <div className={styles.loader} role="status" aria-live="polite">
      <div className={`${styles.block} ${styles.title}`} />
      <div className={`${styles.block} ${styles.card}`} />
      <div className={`${styles.block} ${styles.line}`} />
      {/* Screen readers hear the label at once; sighted people see it after 5 seconds. */}
      <p className={stage === "explained" ? styles.label : styles.visuallyHidden}>{label}</p>
    </div>
  );
}
