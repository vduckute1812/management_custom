import { describe, expect, it } from "vitest";
import {
  moneyTransactionUpsertBodySchema,
  moneyTransactionsQuerySchema,
} from "../server/schemas";
import { MoneyCategory, MoneyDirection } from "../types/money";
import {
  formatMoneyMinorPlain,
  isYearMonth,
  parseMoneyMinorInput,
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
