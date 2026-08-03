import { describe, expect, it } from "vitest";
import {
  MoneyCategory,
  MoneyDirection,
  MoneySavingsGoalStatus,
  coerceCategoryForDirection,
  defaultCategoryForDirection,
  savingsProgress,
  type MoneyTransaction,
} from "../types/money";
import {
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
    const slices = sumByCategory(rows, MoneyDirection.Out);
    expect(slices[0]).toEqual({
      category: MoneyCategory.Transport,
      amountMinor: 200,
      share: 200 / 350,
    });
    expect(slices[1]).toEqual({
      category: MoneyCategory.Food,
      amountMinor: 150,
      share: 150 / 350,
    });
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
