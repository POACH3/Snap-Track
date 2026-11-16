import type { ReceiptStatus } from "@snaptrack/contracts";
import { CircleAlert, CircleCheck, CircleDashed, Clock } from "lucide-react";
import { STATUS_LABEL } from "./receipt-format.ts";
import styles from "./StatusIcon.module.css";

const ICON = {
  uploaded: { Icon: Clock, tone: styles.muted },
  extracting: { Icon: Clock, tone: styles.muted },
  unreviewed: { Icon: CircleDashed, tone: styles.warning },
  review_required: { Icon: CircleAlert, tone: styles.warning },
  confirmed: { Icon: CircleCheck, tone: styles.success },
} as const;

/**
 * A receipt's status as a colored icon, no word (docs/DESIGN.md, "Receipt status"). Color and
 * shape both carry it, and screen readers hear the status.
 */
export function StatusIcon({ status }: { status: ReceiptStatus }) {
  const { Icon, tone } = ICON[status];
  return <Icon size={16} className={tone} role="img" aria-label={STATUS_LABEL[status]} />;
}
