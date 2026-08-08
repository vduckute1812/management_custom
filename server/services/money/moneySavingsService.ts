import type { z } from "zod";
import {
  addMoneySavingsContribution,
  deleteMoneySavingsContribution,
  deleteMoneySavingsGoal,
  getMoneySavingsContributionById,
  getMoneySavingsGoalById,
  listMoneySavingsContributions,
  listMoneySavingsGoals,
  upsertMoneySavingsGoal,
} from "~/server/db/money/moneySavings";
import { DomainError } from "~/server/utils/http";
import type {
  moneySavingsContributionCreateBodySchema,
  moneySavingsGoalUpsertBodySchema,
} from "~/server/schemas";
import { MoneySavingsGoalStatus } from "~/types/money";
import type { MoneySavingsContribution, MoneySavingsGoal } from "~/types/money";

type GoalUpsert = z.infer<typeof moneySavingsGoalUpsertBodySchema>;
type ContribCreate = z.infer<typeof moneySavingsContributionCreateBodySchema>;

export async function listMoneySavingsGoalsForUser(
  userId: string,
): Promise<{ goals: MoneySavingsGoal[] }> {
  const goals = await listMoneySavingsGoals(userId);
  return { goals };
}

export async function upsertMoneySavingsGoalForUser(
  userId: string,
  body: GoalUpsert,
): Promise<{ goal: MoneySavingsGoal; created: boolean }> {
  return upsertMoneySavingsGoal(userId, {
    id: body.id,
    title: body.title,
    targetMinor: body.targetMinor,
    status: body.status ?? MoneySavingsGoalStatus.Active,
    targetDate: body.targetDate,
    note: body.note,
  });
}

export async function deleteMoneySavingsGoalForUser(
  userId: string,
  id: string,
): Promise<void> {
  const existing = await getMoneySavingsGoalById(userId, id);
  if (!existing) {
    throw new DomainError(404, "Savings goal not found");
  }
  await deleteMoneySavingsGoal(userId, id);
}

export async function listMoneySavingsContributionsForUser(
  userId: string,
  goalId: string,
  options: { limit?: number; cursor?: string | null } = {},
): Promise<{
  contributions: MoneySavingsContribution[];
  nextCursor: string | null;
  goal: MoneySavingsGoal;
}> {
  const goal = await getMoneySavingsGoalById(userId, goalId);
  if (!goal) {
    throw new DomainError(404, "Savings goal not found");
  }
  const page = await listMoneySavingsContributions(userId, goalId, options);
  return {
    contributions: page.contributions,
    nextCursor: page.nextCursor,
    goal,
  };
}

export async function addMoneySavingsContributionForUser(
  userId: string,
  goalId: string,
  body: ContribCreate,
): Promise<{
  contribution: MoneySavingsContribution;
  goal: MoneySavingsGoal;
}> {
  const contribution = await addMoneySavingsContribution(userId, {
    goalId,
    occurredOn: body.occurredOn,
    amountMinor: body.amountMinor,
    note: body.note,
  });
  const goal = await getMoneySavingsGoalById(userId, goalId);
  if (!goal) {
    throw new DomainError(404, "Savings goal not found");
  }
  return { contribution, goal };
}

export async function deleteMoneySavingsContributionForUser(
  userId: string,
  id: string,
): Promise<void> {
  const existing = await getMoneySavingsContributionById(userId, id);
  if (!existing) {
    throw new DomainError(404, "Contribution not found");
  }
  await deleteMoneySavingsContribution(userId, id);
}
