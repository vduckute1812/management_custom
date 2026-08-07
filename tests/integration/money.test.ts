/**
 * Money savings JOIN aggregate + budget multi-row month copy.
 * Skipped unless DB_INTEGRATION=1.
 */
import { describe, expect, it } from "vitest";
import {
  addMoneySavingsContribution,
  deleteMoneySavingsGoal,
  getMoneySavingsGoalById,
  listMoneySavingsGoals,
  upsertMoneySavingsGoal,
} from "../../server/db/moneySavings";
import {
  copyMoneyBudgetsFromMonth,
  deleteMoneyBudget,
  listMoneyBudgets,
  upsertMoneyBudget,
} from "../../server/db/moneyBudgets";
import { createUser } from "../../server/utils/db";
import { deleteUserAccount } from "../../server/services/accountDeletionService";
import {
  MoneyBudgetScope,
  MoneyCategory,
  MoneySavingsGoalStatus,
} from "../../types/money";
import {
  assertIntegrationDbReady,
  integrationEnabled,
  useIntegrationPoolTeardown,
} from "./helpers";

describe.skipIf(!integrationEnabled)(
  "integration: money savings + budgets",
  () => {
    useIntegrationPoolTeardown();

    it("lists goals with JOIN SUM saved_minor", async () => {
      await assertIntegrationDbReady();
      const user = await createUser({
        email: `it-savings-${Date.now()}@example.test`,
        passwordHash: null,
        name: "IT Savings",
        emailVerified: true,
      });
      try {
        const { goal } = await upsertMoneySavingsGoal(user.id, {
          title: "Emergency",
          targetMinor: 1_000_000,
          status: MoneySavingsGoalStatus.Active,
        });
        await addMoneySavingsContribution(user.id, {
          goalId: goal.id,
          occurredOn: "2026-08-01",
          amountMinor: 250_000,
        });
        await addMoneySavingsContribution(user.id, {
          goalId: goal.id,
          occurredOn: "2026-08-02",
          amountMinor: 50_000,
        });

        const listed = await listMoneySavingsGoals(user.id);
        const found = listed.find((g) => g.id === goal.id);
        expect(found?.savedMinor).toBe(300_000);

        const one = await getMoneySavingsGoalById(user.id, goal.id);
        expect(one?.savedMinor).toBe(300_000);

        await deleteMoneySavingsGoal(user.id, goal.id);
      } finally {
        await deleteUserAccount(user.id);
      }
    });

    it("copies budgets across months in one multi-row upsert", async () => {
      await assertIntegrationDbReady();
      const user = await createUser({
        email: `it-budget-${Date.now()}@example.test`,
        passwordHash: null,
        name: "IT Budget",
        emailVerified: true,
      });
      try {
        const { budget: overall } = await upsertMoneyBudget(user.id, {
          yearMonth: "2026-07",
          scope: MoneyBudgetScope.Overall,
          amountMinor: 5_000_000,
        });
        const { budget: food } = await upsertMoneyBudget(user.id, {
          yearMonth: "2026-07",
          scope: MoneyBudgetScope.Category,
          category: MoneyCategory.Food,
          amountMinor: 1_000_000,
        });

        const copied = await copyMoneyBudgetsFromMonth(
          user.id,
          "2026-07",
          "2026-08",
        );
        expect(copied).toBe(2);

        const august = await listMoneyBudgets(user.id, "2026-08");
        expect(august.budgets).toHaveLength(2);
        expect(
          august.budgets.find((b) => b.scope === MoneyBudgetScope.Overall)
            ?.amountMinor,
        ).toBe(5_000_000);

        // Idempotent re-copy updates amounts rather than duplicating slots.
        await upsertMoneyBudget(user.id, {
          yearMonth: "2026-07",
          scope: MoneyBudgetScope.Overall,
          amountMinor: 6_000_000,
        });
        const recopied = await copyMoneyBudgetsFromMonth(
          user.id,
          "2026-07",
          "2026-08",
        );
        expect(recopied).toBe(2);
        const augustAgain = await listMoneyBudgets(user.id, "2026-08");
        expect(
          augustAgain.budgets.find((b) => b.scope === MoneyBudgetScope.Overall)
            ?.amountMinor,
        ).toBe(6_000_000);

        await deleteMoneyBudget(user.id, overall.id);
        await deleteMoneyBudget(user.id, food.id);
        for (const b of augustAgain.budgets) {
          await deleteMoneyBudget(user.id, b.id);
        }
      } finally {
        await deleteUserAccount(user.id);
      }
    });
  },
);
