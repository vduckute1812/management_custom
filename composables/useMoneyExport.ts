import {
  MONEY_CATEGORY_I18N_KEYS,
  MONEY_SAVINGS_GOAL_STATUS_I18N_KEYS,
  MoneyBudgetScope,
  MoneyDirection,
  type MoneyBudget,
  type MoneyBudgetsMonth,
  type MoneyMonthTotals,
  type MoneySavingsGoal,
  type MoneyTransaction,
} from "~/types/money";
import {
  buildMoneyBudgetsCsv,
  buildMoneyBudgetsJson,
  buildMoneySavingsCsv,
  buildMoneySavingsJson,
  buildMoneyTransactionsCsv,
  buildMoneyTransactionsJson,
} from "~/utils/moneyExport";

function download(filename: string, mime: string, content: string) {
  if (!import.meta.client) return;
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}`
  );
}

export const useMoneyExport = () => {
  const { t } = useI18n();

  function directionLabel(d: MoneyTransaction["direction"]) {
    return d === MoneyDirection.In
      ? t("money.direction.in")
      : t("money.direction.out");
  }

  function categoryLabel(c: MoneyTransaction["category"]) {
    return t(MONEY_CATEGORY_I18N_KEYS[c]);
  }

  function scopeLabel(s: MoneyBudget["scope"]) {
    return s === MoneyBudgetScope.Overall
      ? t("money.budgets.scope.overall")
      : t("money.budgets.scope.category");
  }

  function exportTransactionsCsv(
    yearMonth: string,
    transactions: MoneyTransaction[],
  ) {
    const body = buildMoneyTransactionsCsv(transactions, {
      direction: directionLabel,
      category: categoryLabel,
    });
    download(
      `money-transactions-${yearMonth}-${stamp()}.csv`,
      "text/csv",
      body,
    );
  }

  function exportTransactionsJson(
    yearMonth: string,
    transactions: MoneyTransaction[],
    totals: MoneyMonthTotals | null,
  ) {
    const body = buildMoneyTransactionsJson({
      exportedAt: new Date().toISOString(),
      yearMonth,
      totals,
      transactions,
    });
    download(
      `money-transactions-${yearMonth}-${stamp()}.json`,
      "application/json",
      body,
    );
  }

  function exportSavingsCsv(goals: MoneySavingsGoal[]) {
    const body = buildMoneySavingsCsv(goals, (s) =>
      t(MONEY_SAVINGS_GOAL_STATUS_I18N_KEYS[s]),
    );
    download(`money-savings-${stamp()}.csv`, "text/csv", body);
  }

  function exportSavingsJson(goals: MoneySavingsGoal[]) {
    const body = buildMoneySavingsJson({
      exportedAt: new Date().toISOString(),
      goals,
    });
    download(`money-savings-${stamp()}.json`, "application/json", body);
  }

  function exportBudgetsCsv(month: MoneyBudgetsMonth) {
    const body = buildMoneyBudgetsCsv(month, {
      scope: scopeLabel,
      category: categoryLabel,
    });
    download(
      `money-budgets-${month.yearMonth}-${stamp()}.csv`,
      "text/csv",
      body,
    );
  }

  function exportBudgetsJson(month: MoneyBudgetsMonth) {
    const body = buildMoneyBudgetsJson({
      exportedAt: new Date().toISOString(),
      month,
    });
    download(
      `money-budgets-${month.yearMonth}-${stamp()}.json`,
      "application/json",
      body,
    );
  }

  return {
    exportTransactionsCsv,
    exportTransactionsJson,
    exportSavingsCsv,
    exportSavingsJson,
    exportBudgetsCsv,
    exportBudgetsJson,
  };
};
