// The review form's state: every field as the text in its input, converted to and from the
// contract's ReceiptDraft. Only input checks live here (a figure must be a number); the rules
// about what adds up are the server's (SPEC.md §4.1), reached through `checkDraft`.
import type {
  ConsistencyWarning,
  DraftLine,
  LineUnit,
  ReceiptDetail,
  ReceiptDraft,
} from "@snaptrack/contracts";
import { formatUsd } from "@snaptrack/core";

let nextKey = 0;
/** A key for a row the form adds, so React keeps each row's inputs as rows move. */
export const newKey = () => `row-${++nextKey}`;

export interface FormLine {
  key: string;
  /** The saved line's id; none for a line added in the form. */
  id?: string | undefined;
  kind: "item" | "fee";
  rawName: string;
  itemCode: string;
  quantity: string;
  unit: LineUnit;
  unitPrice: string;
  lineTotal: string;
  discount: string;
  taxCode: string;
}

export interface FormState {
  date: string;
  time: string;
  subtotal: string;
  discount: string;
  tax: string;
  tip: string;
  total: string;
  printedSavings: string;
  printedItemCount: string;
  taxLines: { key: string; label: string; rate: string; amount: string }[];
  payments: {
    key: string;
    method: string;
    cardBrand: string;
    cardType: "" | "credit" | "debit";
    last4: string;
    amount: string;
    approvalCode: string;
  }[];
  transactionNumbers: { key: string; label: string; value: string }[];
  evidence: {
    printedName: string;
    logoText: string;
    legalName: string;
    branchName: string;
    storeNumber: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    merchantId: string;
    /** The model's guess; kept as read, never edited. */
    brandGuess: string | null;
    phones: { key: string; number: string; label: string }[];
    websites: { key: string; value: string }[];
    emails: { key: string; value: string }[];
  };
  note: string;
  lines: FormLine[];
}

/** What's wrong with a field the form can't send, keyed by field (`total`, `lines.<key>.lineTotal`). */
export type FormErrors = Record<string, string>;

const MONEY = /^-?\d*(?:\.\d{0,2})?$/;

/** Cents from "12.34", "$1,234.5" or "-3"; null when empty; undefined when it isn't an amount. */
export function parseMoney(text: string): number | null | undefined {
  const clean = text.trim().replace(/[$,\s]/g, "");
  if (clean === "") return null;
  if (!MONEY.test(clean) || clean === "-" || clean === "." || clean === "-.") return undefined;
  const negative = clean.startsWith("-");
  const [whole = "", fraction = ""] = clean.replace("-", "").split(".");
  const cents = Number(whole === "" ? "0" : whole) * 100 + Number(fraction.padEnd(2, "0"));
  return negative ? -cents : cents;
}

/** "12.34" for an input: no currency sign, so it can be typed over. */
export function moneyText(cents: number | null): string {
  if (cents === null) return "";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Thousandths from "2.31"; undefined unless a positive number with at most three decimals. */
export function parseQuantity(text: string): number | undefined {
  const clean = text.trim();
  if (!/^\d*(?:\.\d{0,3})?$/.test(clean) || clean === "" || clean === ".") return undefined;
  const [whole = "", fraction = ""] = clean.split(".");
  const milli = Number(whole === "" ? "0" : whole) * 1000 + Number(fraction.padEnd(3, "0"));
  return milli > 0 ? milli : undefined;
}

export function quantityText(milli: number): string {
  const whole = Math.floor(milli / 1000);
  const fraction = String(milli % 1000)
    .padStart(3, "0")
    .replace(/0+$/, "");
  return fraction === "" ? String(whole) : `${whole}.${fraction}`;
}

const text = (value: string | null) => value ?? "";
const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

export function blankLine(): FormLine {
  return {
    key: newKey(),
    kind: "item",
    rawName: "",
    itemCode: "",
    quantity: "1",
    unit: "each",
    unitPrice: "",
    lineTotal: "",
    discount: "",
    taxCode: "",
  };
}

/** Split: a copy of the line right below it, same printed name and code, amounts empty (SPEC.md §6.5). */
export function splitOf(line: FormLine): FormLine {
  return { ...blankLine(), kind: line.kind, rawName: line.rawName, itemCode: line.itemCode };
}

export function formFromDraft(draft: ReceiptDetail["draft"]): FormState {
  const [date = "", time = ""] = (draft.purchasedAt ?? "").split("T");
  const e = draft.storeEvidence;
  return {
    date,
    time,
    subtotal: moneyText(draft.subtotalCents),
    discount: moneyText(draft.discountCents),
    tax: moneyText(draft.taxCents),
    tip: moneyText(draft.tipCents),
    total: moneyText(draft.totalCents),
    printedSavings: moneyText(draft.printedSavingsCents),
    printedItemCount: draft.printedItemCount === null ? "" : String(draft.printedItemCount),
    taxLines: draft.taxLines.map((t) => ({
      key: newKey(),
      label: text(t.label),
      rate: text(t.rate),
      amount: moneyText(t.amountCents),
    })),
    payments: draft.payments.map((p) => ({
      key: newKey(),
      method: text(p.method),
      cardBrand: text(p.cardBrand),
      cardType: p.cardType ?? "",
      last4: text(p.last4),
      amount: moneyText(p.amountCents),
      approvalCode: text(p.approvalCode),
    })),
    transactionNumbers: draft.transactionNumbers.map((t) => ({
      key: newKey(),
      label: text(t.label),
      value: t.value,
    })),
    evidence: {
      printedName: text(e.printedName),
      logoText: text(e.logoText),
      legalName: text(e.legalName),
      branchName: text(e.branchName),
      storeNumber: text(e.storeNumber),
      street: text(e.address?.street ?? null),
      city: text(e.address?.city ?? null),
      state: text(e.address?.state ?? null),
      zip: text(e.address?.zip ?? null),
      merchantId: text(e.merchantId),
      brandGuess: e.brandGuess,
      phones: e.phones.map((p) => ({ key: newKey(), number: p.number, label: text(p.label) })),
      websites: e.websites.map((value) => ({ key: newKey(), value })),
      emails: e.emails.map((value) => ({ key: newKey(), value })),
    },
    note: text(draft.note),
    lines: draft.lines.map((line) => ({
      key: line.id,
      id: line.id,
      kind: line.kind,
      rawName: text(line.rawName),
      itemCode: text(line.itemCode),
      quantity: quantityText(line.quantityMilli),
      unit: line.unit,
      unitPrice: moneyText(line.unitPriceCents),
      lineTotal: moneyText(line.lineTotalCents),
      discount: moneyText(line.discountCents),
      taxCode: text(line.taxCode),
    })),
  };
}

const NOT_AMOUNT = "Enter an amount, like 4.99.";

/** The form as a draft to send, or what to fix first. */
export function draftFromForm(form: FormState): { draft: ReceiptDraft } | { errors: FormErrors } {
  const errors: FormErrors = {};
  const money = (field: string, value: string): number | null => {
    const cents = parseMoney(value);
    if (cents === undefined) {
      errors[field] = NOT_AMOUNT;
      return null;
    }
    return cents;
  };

  const itemCount = form.printedItemCount.trim();
  if (itemCount !== "" && !/^\d+$/.test(itemCount)) errors["printedItemCount"] = "Enter a whole number.";
  if (form.time !== "" && form.date === "") errors["date"] = "Enter the date too, or clear the time.";

  const lines: DraftLine[] = form.lines.map((line) => {
    const quantityMilli = parseQuantity(line.quantity);
    if (quantityMilli === undefined) errors[`lines.${line.key}.quantity`] = "Enter a quantity above zero.";
    return {
      ...(line.id === undefined ? {} : { id: line.id }),
      kind: line.kind,
      rawName: orNull(line.rawName),
      itemCode: orNull(line.itemCode),
      quantityMilli: quantityMilli ?? 1000,
      unit: line.unit,
      unitPriceCents: money(`lines.${line.key}.unitPrice`, line.unitPrice),
      lineTotalCents: money(`lines.${line.key}.lineTotal`, line.lineTotal),
      discountCents: money(`lines.${line.key}.discount`, line.discount),
      taxCode: orNull(line.taxCode),
    };
  });

  const payments = form.payments.map((p) => {
    const last4 = p.last4.trim();
    if (last4 !== "" && !/^\d{4}$/.test(last4))
      errors[`payments.${p.key}.last4`] = "Enter the last four digits only.";
    return {
      method: orNull(p.method),
      cardBrand: orNull(p.cardBrand),
      cardType: p.cardType === "" ? null : p.cardType,
      last4: /^\d{4}$/.test(last4) ? last4 : null,
      amountCents: money(`payments.${p.key}.amount`, p.amount),
      approvalCode: orNull(p.approvalCode),
    };
  });

  const taxLines = form.taxLines.flatMap((t) => {
    const amountCents = money(`taxLines.${t.key}.amount`, t.amount);
    return amountCents === null ? [] : [{ label: orNull(t.label), rate: orNull(t.rate), amountCents }];
  });

  const e = form.evidence;
  const address = [e.street, e.city, e.state, e.zip].some((part) => part.trim() !== "")
    ? { street: orNull(e.street), city: orNull(e.city), state: orNull(e.state), zip: orNull(e.zip) }
    : null;

  const draft: ReceiptDraft = {
    purchasedAt: form.date === "" ? null : form.time === "" ? form.date : `${form.date}T${form.time}`,
    subtotalCents: money("subtotal", form.subtotal),
    discountCents: money("discount", form.discount),
    taxCents: money("tax", form.tax),
    tipCents: money("tip", form.tip),
    totalCents: money("total", form.total),
    printedSavingsCents: money("printedSavings", form.printedSavings),
    printedItemCount: /^\d+$/.test(itemCount) ? Number(itemCount) : null,
    taxLines,
    payments,
    transactionNumbers: form.transactionNumbers.flatMap((t) =>
      t.value.trim() === "" ? [] : [{ label: orNull(t.label), value: t.value.trim() }],
    ),
    storeEvidence: {
      printedName: orNull(e.printedName),
      logoText: orNull(e.logoText),
      legalName: orNull(e.legalName),
      branchName: orNull(e.branchName),
      storeNumber: orNull(e.storeNumber),
      address,
      merchantId: orNull(e.merchantId),
      brandGuess: e.brandGuess,
      phones: e.phones.flatMap((p) =>
        p.number.trim() === "" ? [] : [{ number: p.number.trim(), label: orNull(p.label) }],
      ),
      websites: e.websites.flatMap((w) => (w.value.trim() === "" ? [] : [w.value.trim()])),
      emails: e.emails.flatMap((w) => (w.value.trim() === "" ? [] : [w.value.trim()])),
    },
    note: orNull(form.note),
    lines,
  };
  return Object.keys(errors).length > 0 ? { errors } : { draft };
}

/** The input a warning belongs next to. Line warnings name the line by its place in the list. */
export function warningField(warning: ConsistencyWarning, lines: readonly FormLine[]): string {
  switch (warning.kind) {
    case "lines-vs-subtotal":
      return "subtotal";
    case "subtotal-vs-total":
    case "payments-vs-total":
      return "total";
    case "tax-lines-vs-tax":
      return "tax";
    case "discounts-vs-savings":
      return "printedSavings";
    case "item-count":
      return "printedItemCount";
    case "line-price":
      return `lines.${lines[warning.position]?.key ?? ""}.lineTotal`;
    case "date-in-future":
    case "date-too-old":
      return "date";
  }
}

/** What the warning says, in plain words (docs/DESIGN.md, "Consistency warning"). */
export function warningText(warning: ConsistencyWarning): string {
  switch (warning.kind) {
    case "lines-vs-subtotal":
      return `The items add up to ${formatUsd(warning.expectedCents)}, but the subtotal says ${formatUsd(warning.printedCents)}. A line may be missing or misread.`;
    case "subtotal-vs-total":
      return `Subtotal, discount, tax and tip come to ${formatUsd(warning.expectedCents)}, but the total says ${formatUsd(warning.printedCents)}.`;
    case "tax-lines-vs-tax":
      return `The tax lines add up to ${formatUsd(warning.expectedCents)}, but the tax says ${formatUsd(warning.printedCents)}.`;
    case "payments-vs-total":
      return `The payments add up to ${formatUsd(warning.expectedCents)}, but the total says ${formatUsd(warning.printedCents)}.`;
    case "discounts-vs-savings":
      return `The discounts add up to ${formatUsd(warning.expectedCents)}, but the receipt says you saved ${formatUsd(warning.printedCents)}.`;
    case "item-count":
      return `There are ${warning.counted} items, but the receipt says ${warning.printed}.`;
    case "line-price":
      return `Quantity × unit price is ${formatUsd(warning.expectedCents)}, but this line says ${formatUsd(warning.printedCents)} before discount.`;
    case "date-in-future":
      return "This date is in the future.";
    case "date-too-old":
      return "This date is more than two years before the photo was uploaded.";
  }
}
