import { describe, expect, it } from "vitest";
import {
  MoneyBudgetScope,
  MoneyCategory,
  MoneyDirection,
  MoneySavingsGoalStatus,
  budgetProgress,
  coerceCategoryForDirection,
  defaultCategoryForDirection,
  savingsProgress,
  type MoneyTransaction,
} from "../types/money";
import {
  moneyBudgetUpsertBodySchema,
  moneyBudgetsQuerySchema,
  moneySavingsContributionCreateBodySchema,
  moneySavingsGoalUpsertBodySchema,
  moneyTransactionUpsertBodySchema,
  moneyTransactionsQuerySchema,
} from "../server/schemas";
import {
  formatMoneyMinorPlain,
  isYearMonth,
  parseMoneyMinorInput,
  sumByCategory,
  sumDaily,
  toYearMonth,
  yearMonthRange,
} from "../utils/money";
import {
  buildMoneyBudgetsCsv,
  buildMoneyBudgetsJson,
  buildMoneySavingsCsv,
  buildMoneySavingsJson,
  buildMoneyTransactionsCsv,
  buildMoneyTransactionsJson,
  csvField,
  csvRow,
} from "../utils/moneyExport";

describe("moneyTransactionsQuerySchema", () => {
  it("accepts empty query", () => {
    expect(moneyTransactionsQuerySchema.safeParse({}).success).toBe(true);
  });

  it("accepts YYYY-MM", () => {
    expect(
      moneyTransactionsQuerySchema.safeParse({ yearMonth: "2026-08" }).success,
    ).toBe(true);
  });

  it("rejects bad yearMonth", () => {
    expect(
      moneyTransactionsQuerySchema.safeParse({ yearMonth: "2026-13" }).success,
    ).toBe(false);
    expect(
      moneyTransactionsQuerySchema.safeParse({ yearMonth: "Aug 2026" }).success,
    ).toBe(false);
  });
});

describe("moneyTransactionUpsertBodySchema", () => {
  const base = {
    occurredOn: "2026-08-03",
    amountMinor: 150_000,
    direction: MoneyDirection.Out,
    category: MoneyCategory.Food,
  };

  it("accepts a valid expense", () => {
    const parsed = moneyTransactionUpsertBodySchema.safeParse(base);
    expect(parsed.success).toBe(true);
  });

  it("rejects string direction / category", () => {
    expect(
      moneyTransactionUpsertBodySchema.safeParse({
        ...base,
        direction: "out",
      }).success,
    ).toBe(false);
    expect(
      moneyTransactionUpsertBodySchema.safeParse({
        ...base,
        category: "food",
      }).success,
    ).toBe(false);
  });

  it("rejects negative amount", () => {
    expect(
      moneyTransactionUpsertBodySchema.safeParse({
        ...base,
        amountMinor: -1,
      }).success,
    ).toBe(false);
  });

  it("rejects fractional amount", () => {
    expect(
      moneyTransactionUpsertBodySchema.safeParse({
        ...base,
        amountMinor: 1.5,
      }).success,
    ).toBe(false);
  });
});

describe("money utils", () => {
  it("parses digit groups with separators", () => {
    expect(parseMoneyMinorInput("150.000")).toBe(150_000);
    expect(parseMoneyMinorInput("150,000")).toBe(150_000);
    expect(parseMoneyMinorInput(" 1 500 ")).toBe(1_500);
    expect(parseMoneyMinorInput("")).toBeNull();
  });

  it("formats plain amounts", () => {
    expect(formatMoneyMinorPlain(1_500_000)).toMatch(/1/);
  });

  it("yearMonth helpers", () => {
    expect(isYearMonth("2026-08")).toBe(true);
    expect(isYearMonth("2026-8")).toBe(false);
    expect(toYearMonth(new Date(2026, 7, 15))).toBe("2026-08");
    expect(yearMonthRange("2026-02")).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
    });
  });
});

function tx(
  partial: Partial<MoneyTransaction> &
    Pick<
      MoneyTransaction,
      "amountMinor" | "direction" | "category" | "occurredOn"
    >,
): MoneyTransaction {
  return {
    id: partial.id ?? "mtx_test",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...partial,
  };
}

describe("sumByCategory / sumDaily", () => {
  const rows = [
    tx({
      id: "a",
      occurredOn: "2026-08-01",
      amountMinor: 100,
      direction: MoneyDirection.Out,
      category: MoneyCategory.Food,
    }),
    tx({
      id: "b",
      occurredOn: "2026-08-01",
      amountMinor: 50,
      direction: MoneyDirection.Out,
      category: MoneyCategory.Food,
    }),
    tx({
      id: "c",
      occurredOn: "2026-08-02",
      amountMinor: 200,
      direction: MoneyDirection.Out,
      category: MoneyCategory.Transport,
    }),
    tx({
      id: "d",
      occurredOn: "2026-08-02",
      amountMinor: 1000,
      direction: MoneyDirection.In,
      category: MoneyCategory.Income,
    }),
  ];

  it("groups expenses by category with shares", () => {
    const slices = sumByCategory(rows, MoneyDirection.Out, (k) => k);
    expect(slices[0]?.key).toBe("b:1");
    expect(slices[0]?.amountMinor).toBe(200);
    expect(slices[0]?.share).toBe(200 / 350);
    expect(slices[1]?.key).toBe("b:0");
    expect(slices[1]?.amountMinor).toBe(150);
  });

  it("fills every day of the month when requested", () => {
    const points = sumDaily(rows, "2026-08", { fillAll: true });
    expect(points).toHaveLength(31);
    expect(points[0]).toEqual({
      day: "2026-08-01",
      outMinor: 150,
      inMinor: 0,
    });
    expect(points[1]).toEqual({
      day: "2026-08-02",
      outMinor: 200,
      inMinor: 1000,
    });
    expect(points[2]).toEqual({
      day: "2026-08-03",
      outMinor: 0,
      inMinor: 0,
    });
  });
});

describe("category direction helpers", () => {
  it("defaults Income for In and Food for Out", () => {
    expect(defaultCategoryForDirection(MoneyDirection.In)).toBe(
      MoneyCategory.Income,
    );
    expect(defaultCategoryForDirection(MoneyDirection.Out)).toBe(
      MoneyCategory.Food,
    );
  });

  it("coerces mismatched Income ↔ expense categories", () => {
    expect(
      coerceCategoryForDirection(MoneyCategory.Food, MoneyDirection.In),
    ).toBe(MoneyCategory.Income);
    expect(
      coerceCategoryForDirection(MoneyCategory.Income, MoneyDirection.Out),
    ).toBe(MoneyCategory.Food);
    expect(
      coerceCategoryForDirection(MoneyCategory.Transfer, MoneyDirection.In),
    ).toBe(MoneyCategory.Transfer);
  });
});

describe("money savings schemas", () => {
  it("accepts a goal upsert", () => {
    expect(
      moneySavingsGoalUpsertBodySchema.safeParse({
        title: "Emergency",
        targetMinor: 10_000_000,
        status: MoneySavingsGoalStatus.Active,
      }).success,
    ).toBe(true);
  });

  it("rejects string status and empty title", () => {
    expect(
      moneySavingsGoalUpsertBodySchema.safeParse({
        title: "x",
        targetMinor: 1,
        status: "active",
      }).success,
    ).toBe(false);
    expect(
      moneySavingsGoalUpsertBodySchema.safeParse({
        title: "  ",
        targetMinor: 1,
      }).success,
    ).toBe(false);
  });

  it("requires contribution amount >= 1", () => {
    expect(
      moneySavingsContributionCreateBodySchema.safeParse({
        occurredOn: "2026-08-03",
        amountMinor: 0,
      }).success,
    ).toBe(false);
    expect(
      moneySavingsContributionCreateBodySchema.safeParse({
        occurredOn: "2026-08-03",
        amountMinor: 50_000,
      }).success,
    ).toBe(true);
  });
});

describe("savingsProgress", () => {
  it("returns 0 for empty targets and ratios otherwise", () => {
    expect(savingsProgress(0, 100)).toBe(0);
    expect(savingsProgress(50, 0)).toBe(0);
    expect(savingsProgress(50, 100)).toBe(0.5);
  });
});

describe("money budget schemas", () => {
  it("accepts overall and category budgets", () => {
    expect(
      moneyBudgetUpsertBodySchema.safeParse({
        yearMonth: "2026-08",
        scope: MoneyBudgetScope.Overall,
        amountMinor: 20_000_000,
      }).success,
    ).toBe(true);
    expect(
      moneyBudgetUpsertBodySchema.safeParse({
        yearMonth: "2026-08",
        scope: MoneyBudgetScope.Category,
        category: MoneyCategory.Food,
        amountMinor: 3_000_000,
      }).success,
    ).toBe(true);
  });

  it("rejects mismatched scope/category", () => {
    expect(
      moneyBudgetUpsertBodySchema.safeParse({
        yearMonth: "2026-08",
        scope: MoneyBudgetScope.Overall,
        category: MoneyCategory.Food,
        amountMinor: 1,
      }).success,
    ).toBe(false);
    expect(
      moneyBudgetUpsertBodySchema.safeParse({
        yearMonth: "2026-08",
        scope: MoneyBudgetScope.Category,
        amountMinor: 1,
      }).success,
    ).toBe(false);
  });

  it("accepts optional yearMonth query", () => {
    expect(moneyBudgetsQuerySchema.safeParse({}).success).toBe(true);
    expect(
      moneyBudgetsQuerySchema.safeParse({ yearMonth: "2026-08" }).success,
    ).toBe(true);
  });
});

describe("budgetProgress", () => {
  it("mirrors savingsProgress semantics", () => {
    expect(budgetProgress(0, 100)).toBe(0);
    expect(budgetProgress(120, 100)).toBe(1.2);
  });
});

describe("moneyExport builders", () => {
  const tx: MoneyTransaction = {
    id: "mtx_1",
    occurredOn: "2026-08-01",
    amountMinor: 50_000,
    direction: MoneyDirection.Out,
    category: MoneyCategory.Food,
    note: 'Lunch, "pho"',
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };

  it("escapes CSV fields with quotes and commas", () => {
    expect(csvField('a,"b"')).toBe('"a,""b"""');
    expect(csvField(null)).toBe("");
    expect(csvRow([1, "x,y"])).toBe('1,"x,y"');
  });

  it("builds transactions CSV with integer enums + labels", () => {
    const csv = buildMoneyTransactionsCsv([tx], {
      direction: () => "Expense",
      category: () => "Food",
    });
    expect(csv).toContain("occurred_on");
    expect(csv).toContain("mtx_1");
    expect(csv).toContain(",0,Expense,0,,Food,");
    expect(csv).toContain('"Lunch, ""pho"""');
  });

  it("builds transactions JSON payload", () => {
    const json = buildMoneyTransactionsJson({
      exportedAt: "2026-08-03T00:00:00.000Z",
      yearMonth: "2026-08",
      totals: {
        yearMonth: "2026-08",
        inMinor: 0,
        outMinor: 50_000,
        netMinor: -50_000,
      },
      transactions: [tx],
    });
    const parsed = JSON.parse(json);
    expect(parsed.yearMonth).toBe("2026-08");
    expect(parsed.transactions).toHaveLength(1);
    expect(parsed.totals.outMinor).toBe(50_000);
  });

  it("builds savings CSV/JSON", () => {
    const goal = {
      id: "msg_1",
      title: "Emergency",
      targetMinor: 10_000_000,
      savedMinor: 2_000_000,
      progress: 0.2,
      status: MoneySavingsGoalStatus.Active,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    };
    const csv = buildMoneySavingsCsv([goal], () => "Active");
    expect(csv).toContain("msg_1");
    expect(csv).toContain(",0,Active,");
    const parsed = JSON.parse(
      buildMoneySavingsJson({
        exportedAt: "2026-08-03T00:00:00.000Z",
        goals: [goal],
      }),
    );
    expect(parsed.goals[0].savedMinor).toBe(2_000_000);
  });

  it("builds budgets CSV/JSON", () => {
    const month = {
      yearMonth: "2026-08",
      budgetMinor: 5_000_000,
      spentMinor: 1_000_000,
      budgets: [
        {
          id: "mbd_1",
          yearMonth: "2026-08",
          scope: MoneyBudgetScope.Overall,
          amountMinor: 5_000_000,
          spentMinor: 1_000_000,
          progress: 0.2,
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      ],
    };
    const csv = buildMoneyBudgetsCsv(month, {
      scope: () => "Overall",
      category: () => "Food",
    });
    expect(csv).toContain("mbd_1");
    expect(csv).toContain(",0,Overall,");
    const parsed = JSON.parse(
      buildMoneyBudgetsJson({
        exportedAt: "2026-08-03T00:00:00.000Z",
        month,
      }),
    );
    expect(parsed.month.budgets).toHaveLength(1);
  });
});
