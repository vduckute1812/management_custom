/**
 * Pure builders for Money CSV / JSON exports (Sprint 5).
 * Labels are injected by the caller so Vitest does not need i18n.
 */

import type {
  MoneyBudget,
  MoneyBudgetsMonth,
  MoneySavingsGoal,
  MoneyTransaction,
  MoneyMonthTotals,
} from "~/types/money";

export function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvField).join(",");
}

export function buildMoneyTransactionsCsv(
  transactions: MoneyTransaction[],
  labels: {
    direction: (d: MoneyTransaction["direction"]) => string;
    category: (tx: MoneyTransaction) => string;
  },
): string {
  const header = [
    "id",
    "occurred_on",
    "amount_minor",
    "direction",
    "direction_label",
    "category",
    "user_category_id",
    "category_label",
    "note",
    "created_at",
    "updated_at",
  ];
  const rows = [header.join(",")];
  for (const tx of transactions) {
    rows.push(
      csvRow([
        tx.id,
        tx.occurredOn,
        tx.amountMinor,
        tx.direction,
        labels.direction(tx.direction),
        tx.category ?? "",
        tx.userCategoryId ?? "",
        labels.category(tx),
        tx.note ?? "",
        tx.createdAt,
        tx.updatedAt,
      ]),
    );
  }
  return rows.join("\n") + "\n";
}

export function buildMoneyTransactionsJson(payload: {
  exportedAt: string;
  yearMonth: string;
  totals: MoneyMonthTotals | null;
  transactions: MoneyTransaction[];
}): string {
  return JSON.stringify(payload, null, 2);
}

export function buildMoneySavingsCsv(
  goals: MoneySavingsGoal[],
  statusLabel: (s: MoneySavingsGoal["status"]) => string,
): string {
  const header = [
    "id",
    "title",
    "target_minor",
    "saved_minor",
    "progress",
    "status",
    "status_label",
    "target_date",
    "note",
    "created_at",
    "updated_at",
  ];
  const rows = [header.join(",")];
  for (const g of goals) {
    rows.push(
      csvRow([
        g.id,
        g.title,
        g.targetMinor,
        g.savedMinor,
        g.progress,
        g.status,
        statusLabel(g.status),
        g.targetDate ?? "",
        g.note ?? "",
        g.createdAt,
        g.updatedAt,
      ]),
    );
  }
  return rows.join("\n") + "\n";
}

export function buildMoneySavingsJson(payload: {
  exportedAt: string;
  goals: MoneySavingsGoal[];
}): string {
  return JSON.stringify(payload, null, 2);
}

export function buildMoneyBudgetsCsv(
  month: MoneyBudgetsMonth,
  labels: {
    scope: (s: MoneyBudget["scope"]) => string;
    category: (b: MoneyBudget) => string;
  },
): string {
  const header = [
    "id",
    "year_month",
    "scope",
    "scope_label",
    "category",
    "user_category_id",
    "category_label",
    "amount_minor",
    "spent_minor",
    "progress",
    "created_at",
    "updated_at",
  ];
  const rows = [header.join(",")];
  for (const b of month.budgets) {
    rows.push(
      csvRow([
        b.id,
        b.yearMonth,
        b.scope,
        labels.scope(b.scope),
        b.category ?? "",
        b.userCategoryId ?? "",
        labels.category(b),
        b.amountMinor,
        b.spentMinor,
        b.progress,
        b.createdAt,
        b.updatedAt,
      ]),
    );
  }
  return rows.join("\n") + "\n";
}

export function buildMoneyBudgetsJson(payload: {
  exportedAt: string;
  month: MoneyBudgetsMonth;
}): string {
  return JSON.stringify(payload, null, 2);
}
