import { LineUnit } from "@snaptrack/contracts";
import { ChevronDown, Ellipsis, Plus, Split, Trash2, TriangleAlert, X } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Button } from "../../shared/ui/Button.tsx";
import { Modal } from "../../shared/ui/Modal.tsx";
import {
  blankLine,
  newKey,
  splitOf,
  type FormErrors,
  type FormLine,
  type FormState,
} from "./receipt-form.ts";
import styles from "./ReceiptFields.module.css";

export type Update = (change: (form: FormState) => FormState) => void;

interface FieldsProps {
  form: FormState;
  update: Update;
  errors: FormErrors;
  /** Warning text for each field it belongs next to. */
  warnings: ReadonlyMap<string, readonly string[]>;
  wide: boolean;
  rawText: string | null;
}

// ---------- small building blocks ----------

interface InputProps {
  label: string;
  /** Label shown above the input; otherwise it is only for screen readers. */
  showLabel?: boolean;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  warnings?: readonly string[] | undefined;
  type?: "text" | "date" | "time";
  amount?: boolean;
  className?: string;
  placeholder?: string;
}

/** One input with its label, error (red) and warnings (amber, never blocking). */
function Input({
  label,
  showLabel = true,
  value,
  onChange,
  error,
  warnings,
  type = "text",
  amount = false,
  className,
  placeholder,
}: InputProps) {
  const id = useId();
  const hasWarning = warnings !== undefined && warnings.length > 0;
  const describedBy = [error === undefined ? null : `${id}-e`, hasWarning ? `${id}-w` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={[styles.field, className].filter(Boolean).join(" ")}>
      <label htmlFor={id} className={showLabel ? styles.label : styles.hidden}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder ?? (amount ? "—" : undefined)}
        inputMode={amount ? "decimal" : undefined}
        className={[
          styles.input,
          amount ? styles.amount : undefined,
          error !== undefined ? styles.invalid : hasWarning ? styles.warned : undefined,
        ]
          .filter(Boolean)
          .join(" ")}
        aria-invalid={error !== undefined}
        aria-describedby={describedBy === "" ? undefined : describedBy}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      {error !== undefined && (
        <p id={`${id}-e`} className={styles.error}>
          {error}
        </p>
      )}
      {hasWarning && <Warnings id={`${id}-w`} texts={warnings} />}
    </div>
  );
}

export function Warnings({ id, texts }: { id?: string; texts: readonly string[] }) {
  return (
    <div id={id} className={styles.warnings}>
      {texts.map((text) => (
        <p key={text} role="note" className={styles.warning}>
          <TriangleAlert size={16} aria-hidden className={styles.warningIcon} />
          <span>{text}</span>
        </p>
      ))}
    </div>
  );
}

/** A collapsed section that opens in place (docs/DESIGN.md, "Collapsed sections"). */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className={styles.section}>
      <summary className={styles.summary}>
        {title}
        <ChevronDown size={18} aria-hidden className={styles.chevron} />
      </summary>
      <div className={styles.sectionBody}>{children}</div>
    </details>
  );
}

function RemoveRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className={styles.iconButton} aria-label={label} onClick={onClick}>
      <X size={18} aria-hidden />
    </button>
  );
}

// ---------- the form ----------

/** Every editable field of a receipt (SPEC.md §6.5), in the order the review screens show them. */
export function ReceiptFields({ form, update, errors, warnings, wide, rawText }: FieldsProps) {
  const [optionsFor, setOptionsFor] = useState<string | null>(null);
  const set =
    <K extends keyof FormState>(key: K) =>
    (value: FormState[K]) => {
      update((current) => ({ ...current, [key]: value }));
    };
  const setLine = (key: string, change: Partial<FormLine>) => {
    update((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.key === key ? { ...line, ...change } : line)),
    }));
  };
  const optionsLine = form.lines.find((line) => line.key === optionsFor);

  return (
    <div className={styles.fields}>
      <div className={styles.pair}>
        <Input
          label="Date"
          type="date"
          value={form.date}
          onChange={set("date")}
          error={errors["date"]}
          warnings={warnings.get("date")}
        />
        <Input label="Time" type="time" value={form.time} onChange={set("time")} />
      </div>

      <section className={wide ? styles.linesCard : styles.group} aria-labelledby="lines-heading">
        <h2 id="lines-heading" className={styles.eyebrow}>
          Items · {form.lines.length}
        </h2>
        {wide && form.lines.length > 0 && (
          <div className={styles.tableHead} aria-hidden>
            <span>Printed name</span>
            <span>Qty</span>
            <span>Unit price</span>
            <span>Amount</span>
            <span />
          </div>
        )}
        {form.lines.map((line) => {
          const key = line.key;
          const field = (name: string) => `lines.${key}.${name}`;
          return (
            <div key={key} className={wide ? styles.tableRow : styles.lineRow}>
              <Input
                label="Printed name"
                showLabel={false}
                value={line.rawName}
                onChange={(rawName) => {
                  setLine(key, { rawName });
                }}
              />
              {wide && (
                <>
                  <Input
                    label="Quantity"
                    showLabel={false}
                    amount
                    value={line.quantity}
                    error={errors[field("quantity")]}
                    onChange={(quantity) => {
                      setLine(key, { quantity });
                    }}
                  />
                  <Input
                    label="Unit price"
                    showLabel={false}
                    amount
                    value={line.unitPrice}
                    error={errors[field("unitPrice")]}
                    onChange={(unitPrice) => {
                      setLine(key, { unitPrice });
                    }}
                  />
                </>
              )}
              <Input
                label="Amount charged"
                showLabel={false}
                amount
                className={wide ? undefined : styles.lineAmount}
                value={line.lineTotal}
                error={errors[field("lineTotal")]}
                warnings={warnings.get(field("lineTotal"))}
                onChange={(lineTotal) => {
                  setLine(key, { lineTotal });
                }}
              />
              <button
                type="button"
                className={styles.iconButton}
                aria-label={`Line options for ${line.rawName === "" ? "this line" : line.rawName}: details, split, remove`}
                onClick={() => {
                  setOptionsFor(key);
                }}
              >
                <Ellipsis size={18} aria-hidden />
              </button>
            </div>
          );
        })}
        <Button
          variant="ghost"
          className={styles.add}
          onClick={() => {
            update((current) => ({ ...current, lines: [...current.lines, blankLine()] }));
          }}
        >
          <Plus size={18} aria-hidden /> Add line
        </Button>
      </section>

      <div className={wide ? styles.bottom : styles.group}>
        <section className={styles.totals} aria-labelledby="totals-heading">
          <h2 id="totals-heading" className={wide ? styles.hidden : styles.eyebrow}>
            Totals
          </h2>
          {(
            [
              ["subtotal", "Subtotal"],
              ["discount", "Receipt discount"],
              ["tax", "Tax"],
              ["tip", "Tip"],
              ["total", "Total"],
            ] as const
          ).map(([key, label]) => (
            <Input
              key={key}
              label={label}
              amount
              className={key === "total" ? `${styles.totalRow} ${styles.grand}` : styles.totalRow}
              value={form[key]}
              error={errors[key]}
              warnings={warnings.get(key)}
              onChange={set(key)}
            />
          ))}
        </section>

        <div className={styles.sections}>
          <Section title="Note">
            <label className={styles.hidden} htmlFor="receipt-note">
              Note
            </label>
            <textarea
              id="receipt-note"
              className={styles.textarea}
              value={form.note}
              rows={3}
              onChange={(event) => {
                set("note")(event.target.value);
              }}
            />
          </Section>
          <MoreDetails form={form} update={update} errors={errors} warnings={warnings} />
          <StoreDetails form={form} update={update} />
          <Section title="Transcription">
            {rawText === null ? (
              <p className={styles.muted}>Nothing was transcribed.</p>
            ) : (
              <pre className={styles.transcription}>{rawText}</pre>
            )}
          </Section>
        </div>
      </div>

      {optionsLine !== undefined && (
        <LineOptions
          line={optionsLine}
          errors={errors}
          onChange={(change) => {
            setLine(optionsLine.key, change);
          }}
          onSplit={() => {
            update((current) => {
              const index = current.lines.findIndex((l) => l.key === optionsLine.key);
              const lines = [...current.lines];
              lines.splice(index + 1, 0, splitOf(optionsLine));
              return { ...current, lines };
            });
            setOptionsFor(null);
          }}
          onRemove={() => {
            update((current) => ({
              ...current,
              lines: current.lines.filter((l) => l.key !== optionsLine.key),
            }));
            setOptionsFor(null);
          }}
          onClose={() => {
            setOptionsFor(null);
          }}
        />
      )}
    </div>
  );
}

const UNIT_LABEL: Record<(typeof LineUnit.options)[number], string> = {
  each: "each",
  lb: "lb",
  oz: "oz",
  kg: "kg",
  g: "g",
  gal: "gal",
  l: "L",
  ml: "mL",
  fl_oz: "fl oz",
};

/** Everything about one line that the list leaves out, plus split and remove. */
function LineOptions({
  line,
  errors,
  onChange,
  onSplit,
  onRemove,
  onClose,
}: {
  line: FormLine;
  errors: FormErrors;
  onChange: (change: Partial<FormLine>) => void;
  onSplit: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const unitId = useId();
  const kindId = useId();
  const field = (name: string) => errors[`lines.${line.key}.${name}`];
  return (
    <Modal
      open
      size="medium"
      title={line.rawName === "" ? "Line" : line.rawName}
      onClose={onClose}
      actions={
        <>
          <Button variant="danger" onClick={onRemove}>
            <Trash2 size={18} aria-hidden /> Remove line
          </Button>
          <Button variant="secondary" onClick={onSplit}>
            <Split size={18} aria-hidden /> Split line
          </Button>
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      <div className={styles.optionsGrid}>
        <Input
          label="Printed name"
          value={line.rawName}
          onChange={(rawName) => {
            onChange({ rawName });
          }}
          className={styles.span2}
        />
        <Input
          label="Item code"
          value={line.itemCode}
          onChange={(itemCode) => {
            onChange({ itemCode });
          }}
        />
        <div className={styles.field}>
          <label htmlFor={kindId} className={styles.label}>
            Kind
          </label>
          <select
            id={kindId}
            className={styles.input}
            value={line.kind}
            onChange={(event) => {
              onChange({ kind: event.target.value === "fee" ? "fee" : "item" });
            }}
          >
            <option value="item">Item</option>
            <option value="fee">Fee (bag fee, deposit, shipping…)</option>
          </select>
        </div>
        <Input
          label="Quantity"
          amount
          value={line.quantity}
          error={field("quantity")}
          onChange={(quantity) => {
            onChange({ quantity });
          }}
        />
        <div className={styles.field}>
          <label htmlFor={unitId} className={styles.label}>
            Unit
          </label>
          <select
            id={unitId}
            className={styles.input}
            value={line.unit}
            onChange={(event) => {
              const unit = LineUnit.safeParse(event.target.value);
              if (unit.success) onChange({ unit: unit.data });
            }}
          >
            {LineUnit.options.map((unit) => (
              <option key={unit} value={unit}>
                {UNIT_LABEL[unit]}
              </option>
            ))}
          </select>
        </div>
        <Input
          label="Unit price"
          amount
          value={line.unitPrice}
          error={field("unitPrice")}
          onChange={(unitPrice) => {
            onChange({ unitPrice });
          }}
        />
        <Input
          label="Amount charged"
          amount
          value={line.lineTotal}
          error={field("lineTotal")}
          onChange={(lineTotal) => {
            onChange({ lineTotal });
          }}
        />
        <Input
          label="Discount on this line"
          amount
          value={line.discount}
          error={field("discount")}
          onChange={(discount) => {
            onChange({ discount });
          }}
        />
        <Input
          label="Tax code"
          value={line.taxCode}
          onChange={(taxCode) => {
            onChange({ taxCode });
          }}
        />
      </div>
    </Modal>
  );
}

/** Payments, tax lines, transaction numbers and the receipt's printed summary figures. */
function MoreDetails({
  form,
  update,
  errors,
  warnings,
}: {
  form: FormState;
  update: Update;
  errors: FormErrors;
  warnings: ReadonlyMap<string, readonly string[]>;
}) {
  const edit = <K extends "payments" | "taxLines" | "transactionNumbers">(
    key: K,
    rowKey: string,
    change: Partial<FormState[K][number]>,
  ) => {
    update((current) => ({
      ...current,
      [key]: (current[key] as { key: string }[]).map((row) =>
        row.key === rowKey ? { ...row, ...change } : row,
      ),
    }));
  };
  const remove = (key: "payments" | "taxLines" | "transactionNumbers", rowKey: string) => {
    update((current) => ({
      ...current,
      [key]: (current[key] as { key: string }[]).filter((row) => row.key !== rowKey),
    }));
  };

  return (
    <Section title="More details">
      <h3 className={styles.subhead}>Payments</h3>
      {form.payments.map((p) => (
        <div key={p.key} className={styles.rowGrid}>
          <Input
            label="Method"
            value={p.method}
            placeholder="card, cash…"
            onChange={(method) => {
              edit("payments", p.key, { method });
            }}
          />
          <Input
            label="Card brand"
            value={p.cardBrand}
            onChange={(cardBrand) => {
              edit("payments", p.key, { cardBrand });
            }}
          />
          <CardType
            value={p.cardType}
            onChange={(cardType) => {
              edit("payments", p.key, { cardType });
            }}
          />
          <Input
            label="Last 4"
            value={p.last4}
            error={errors[`payments.${p.key}.last4`]}
            onChange={(last4) => {
              edit("payments", p.key, { last4 });
            }}
          />
          <Input
            label="Amount"
            amount
            value={p.amount}
            error={errors[`payments.${p.key}.amount`]}
            onChange={(amount) => {
              edit("payments", p.key, { amount });
            }}
          />
          <Input
            label="Approval code"
            value={p.approvalCode}
            onChange={(approvalCode) => {
              edit("payments", p.key, { approvalCode });
            }}
          />
          <RemoveRow
            label="Remove payment"
            onClick={() => {
              remove("payments", p.key);
            }}
          />
        </div>
      ))}
      <Button
        variant="ghost"
        className={styles.add}
        onClick={() => {
          update((c) => ({
            ...c,
            payments: [
              ...c.payments,
              {
                key: newKey(),
                method: "",
                cardBrand: "",
                cardType: "",
                last4: "",
                amount: "",
                approvalCode: "",
              },
            ],
          }));
        }}
      >
        <Plus size={18} aria-hidden /> Add payment
      </Button>

      <h3 className={styles.subhead}>Tax lines</h3>
      {form.taxLines.map((t) => (
        <div key={t.key} className={styles.rowGrid}>
          <Input
            label="Label"
            value={t.label}
            onChange={(label) => {
              edit("taxLines", t.key, { label });
            }}
          />
          <Input
            label="Rate"
            value={t.rate}
            onChange={(rate) => {
              edit("taxLines", t.key, { rate });
            }}
          />
          <Input
            label="Amount"
            amount
            value={t.amount}
            error={errors[`taxLines.${t.key}.amount`]}
            onChange={(amount) => {
              edit("taxLines", t.key, { amount });
            }}
          />
          <RemoveRow
            label="Remove tax line"
            onClick={() => {
              remove("taxLines", t.key);
            }}
          />
        </div>
      ))}
      <Button
        variant="ghost"
        className={styles.add}
        onClick={() => {
          update((c) => ({
            ...c,
            taxLines: [...c.taxLines, { key: newKey(), label: "", rate: "", amount: "" }],
          }));
        }}
      >
        <Plus size={18} aria-hidden /> Add tax line
      </Button>

      <h3 className={styles.subhead}>Transaction numbers</h3>
      {form.transactionNumbers.map((t) => (
        <div key={t.key} className={styles.rowGrid}>
          <Input
            label="Label"
            value={t.label}
            onChange={(label) => {
              edit("transactionNumbers", t.key, { label });
            }}
          />
          <Input
            label="Number"
            value={t.value}
            onChange={(value) => {
              edit("transactionNumbers", t.key, { value });
            }}
          />
          <RemoveRow
            label="Remove transaction number"
            onClick={() => {
              remove("transactionNumbers", t.key);
            }}
          />
        </div>
      ))}
      <Button
        variant="ghost"
        className={styles.add}
        onClick={() => {
          update((c) => ({
            ...c,
            transactionNumbers: [...c.transactionNumbers, { key: newKey(), label: "", value: "" }],
          }));
        }}
      >
        <Plus size={18} aria-hidden /> Add transaction number
      </Button>

      <h3 className={styles.subhead}>As printed</h3>
      <div className={styles.pair}>
        <Input
          label="Total savings"
          amount
          value={form.printedSavings}
          error={errors["printedSavings"]}
          warnings={warnings.get("printedSavings")}
          onChange={(printedSavings) => {
            update((c) => ({ ...c, printedSavings }));
          }}
        />
        <Input
          label="Number of items"
          value={form.printedItemCount}
          error={errors["printedItemCount"]}
          warnings={warnings.get("printedItemCount")}
          onChange={(printedItemCount) => {
            update((c) => ({ ...c, printedItemCount }));
          }}
        />
      </div>
    </Section>
  );
}

function CardType({
  value,
  onChange,
}: {
  value: "" | "credit" | "debit";
  onChange: (value: "" | "credit" | "debit") => void;
}) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        Credit or debit
      </label>
      <select
        id={id}
        className={styles.input}
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next === "credit" || next === "debit" ? next : "");
        }}
      >
        <option value="">—</option>
        <option value="credit">Credit</option>
        <option value="debit">Debit</option>
      </select>
    </div>
  );
}

type EvidenceText =
  | "printedName"
  | "logoText"
  | "legalName"
  | "branchName"
  | "storeNumber"
  | "street"
  | "city"
  | "state"
  | "zip"
  | "merchantId";
type EvidenceList = "phones" | "websites" | "emails";

/**
 * The store's details as printed. Editable because confirming saves them for the store: a
 * misread phone number can be fixed before it is learned (SPEC.md §6.5).
 */
function StoreDetails({ form, update }: { form: FormState; update: Update }) {
  const e = form.evidence;
  const setText = (key: EvidenceText) => (value: string) => {
    update((c) => ({ ...c, evidence: { ...c.evidence, [key]: value } }));
  };
  const editList = (key: EvidenceList, rowKey: string, change: Record<string, string>) => {
    update((c) => ({
      ...c,
      evidence: {
        ...c.evidence,
        [key]: (c.evidence[key] as { key: string }[]).map((row) =>
          row.key === rowKey ? { ...row, ...change } : row,
        ),
      },
    }));
  };
  const removeFrom = (key: EvidenceList, rowKey: string) => {
    update((c) => ({
      ...c,
      evidence: {
        ...c.evidence,
        [key]: (c.evidence[key] as { key: string }[]).filter((row) => row.key !== rowKey),
      },
    }));
  };
  const addTo = (key: EvidenceList) => {
    update((c) => ({
      ...c,
      evidence: {
        ...c.evidence,
        [key]: [
          ...c.evidence[key],
          key === "phones" ? { key: newKey(), number: "", label: "" } : { key: newKey(), value: "" },
        ],
      },
    }));
  };

  return (
    <Section title="Store details as printed">
      <p className={styles.muted}>Confirming saves these for the store, so it is recognized next time.</p>
      <div className={styles.optionsGrid}>
        <Input label="Printed name" value={e.printedName} onChange={setText("printedName")} />
        <Input label="Logo" value={e.logoText} onChange={setText("logoText")} />
        <Input label="Legal name" value={e.legalName} onChange={setText("legalName")} />
        <Input label="Branch" value={e.branchName} onChange={setText("branchName")} />
        <Input label="Store number" value={e.storeNumber} onChange={setText("storeNumber")} />
        <Input label="Merchant ID" value={e.merchantId} onChange={setText("merchantId")} />
        <Input label="Street" value={e.street} onChange={setText("street")} className={styles.span2} />
        <Input label="City" value={e.city} onChange={setText("city")} />
        <Input label="State" value={e.state} onChange={setText("state")} />
        <Input label="ZIP" value={e.zip} onChange={setText("zip")} />
      </div>

      <h3 className={styles.subhead}>Phone numbers</h3>
      {e.phones.map((p) => (
        <div key={p.key} className={styles.rowGrid}>
          <Input
            label="Number"
            value={p.number}
            onChange={(number) => {
              editList("phones", p.key, { number });
            }}
          />
          <Input
            label="Label"
            value={p.label}
            placeholder="Store, pharmacy…"
            onChange={(label) => {
              editList("phones", p.key, { label });
            }}
          />
          <RemoveRow
            label="Remove phone number"
            onClick={() => {
              removeFrom("phones", p.key);
            }}
          />
        </div>
      ))}
      <Button
        variant="ghost"
        className={styles.add}
        onClick={() => {
          addTo("phones");
        }}
      >
        <Plus size={18} aria-hidden /> Add phone number
      </Button>

      {(["websites", "emails"] as const).map((key) => (
        <div key={key}>
          <h3 className={styles.subhead}>{key === "websites" ? "Websites" : "Email addresses"}</h3>
          {e[key].map((w) => (
            <div key={w.key} className={styles.rowGrid}>
              <Input
                label={key === "websites" ? "Website" : "Email"}
                value={w.value}
                onChange={(value) => {
                  editList(key, w.key, { value });
                }}
              />
              <RemoveRow
                label={key === "websites" ? "Remove website" : "Remove email address"}
                onClick={() => {
                  removeFrom(key, w.key);
                }}
              />
            </div>
          ))}
          <Button
            variant="ghost"
            className={styles.add}
            onClick={() => {
              addTo(key);
            }}
          >
            <Plus size={18} aria-hidden /> {key === "websites" ? "Add website" : "Add email address"}
          </Button>
        </div>
      ))}
    </Section>
  );
}
