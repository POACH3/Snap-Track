import type { IdentifierQuestion } from "@snaptrack/contracts";
import { useState } from "react";
import { Button } from "../../shared/ui/Button.tsx";
import { Modal } from "../../shared/ui/Modal.tsx";
import styles from "./ReceiptScreen.module.css";
import { identifierText } from "./StoreChoice.tsx";

/**
 * "This phone number is saved for Target. Move it to Walmart?" (SPEC.md §6.7): one answer per
 * detail, nothing moved unless the person says so. Saving sends the answers.
 */
export function MoveQuestions({
  questions,
  busy,
  saveLabel,
  onCancel,
  onSave,
}: {
  questions: readonly IdentifierQuestion[];
  busy: boolean;
  saveLabel: string;
  onCancel: () => void;
  onSave: (answers: Record<string, boolean>) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  return (
    <Modal
      open
      size="medium"
      title="Move these details?"
      busy={busy}
      onClose={onCancel}
      actions={
        <>
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            busy={busy}
            disabled={questions.some((q) => answers[q.key] === undefined)}
            onClick={() => {
              onSave(answers);
            }}
          >
            {saveLabel}
          </Button>
        </>
      }
    >
      <div className={styles.questions}>
        <p className={styles.muted}>
          Some details are saved for another store or item. Nothing is moved unless you say so.
        </p>
        {questions.map((q) => (
          <fieldset key={q.key} className={styles.question}>
            <legend className={styles.questionText}>
              The {identifierText(q.identifier)} is saved for {q.about === "item" ? "the item " : ""}
              <strong>{q.savedFor.name}</strong>. Move it to <strong>{q.movingTo}</strong>?
            </legend>
            <label className={styles.answer}>
              <input
                type="radio"
                name={q.key}
                checked={answers[q.key] === true}
                onChange={() => {
                  setAnswers((a) => ({ ...a, [q.key]: true }));
                }}
              />
              Move it to {q.movingTo}
            </label>
            <label className={styles.answer}>
              <input
                type="radio"
                name={q.key}
                checked={answers[q.key] === false}
                onChange={() => {
                  setAnswers((a) => ({ ...a, [q.key]: false }));
                }}
              />
              Keep it with {q.savedFor.name}
            </label>
          </fieldset>
        ))}
      </div>
    </Modal>
  );
}
