import { useState } from "react";
import { ConfirmModal } from "../../shared/ui/ConfirmModal.tsx";
import { Modal } from "../../shared/ui/Modal.tsx";
import { TextField } from "../../shared/ui/TextField.tsx";
import styles from "./MergeDialog.module.css";

export interface MergeOption {
  id: string;
  label: string;
  detail?: string | undefined;
}

/**
 * Merge into another (SPEC.md §4.3, Merges): a search of the others, then a confirm saying what
 * moves. The caller filters `options` by `query` (a server search, or a list it has).
 */
export function MergeDialog({
  title,
  query,
  onQuery,
  options,
  confirmTitle,
  confirmText,
  confirmLabel,
  busy,
  onMerge,
  onClose,
}: {
  title: string;
  query: string;
  onQuery: (query: string) => void;
  options: readonly MergeOption[];
  confirmTitle: (into: MergeOption) => string;
  confirmText: (into: MergeOption) => string;
  confirmLabel: string;
  busy: boolean;
  onMerge: (intoId: string) => void;
  onClose: () => void;
}) {
  const [into, setInto] = useState<MergeOption | null>(null);
  return (
    <>
      <Modal open={into === null} size="medium" title={title} onClose={onClose}>
        <TextField
          label="Find the one to keep"
          value={query}
          autoFocus
          onChange={(event) => {
            onQuery(event.target.value);
          }}
        />
        <ul className={styles.options} aria-label="Merge into">
          {options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                className={styles.option}
                onClick={() => {
                  setInto(option);
                }}
              >
                <span>{option.label}</span>
                {option.detail !== undefined && <span className={styles.detail}>{option.detail}</span>}
              </button>
            </li>
          ))}
          {options.length === 0 && <li className={styles.empty}>Nothing matches.</li>}
        </ul>
      </Modal>
      {into !== null && (
        <ConfirmModal
          open
          title={confirmTitle(into)}
          confirmLabel={confirmLabel}
          busy={busy}
          onCancel={() => {
            setInto(null);
          }}
          onConfirm={() => {
            onMerge(into.id);
          }}
        >
          {confirmText(into)} This can't be undone.
        </ConfirmModal>
      )}
    </>
  );
}
