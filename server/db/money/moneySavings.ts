/**
 * Money savings barrel: goals + contributions.
 */

export {
  deleteMoneySavingsGoal,
  getMoneySavingsGoalById,
  listMoneySavingsGoals,
  moneySavingsGoalIdExists,
  upsertMoneySavingsGoal,
  type UpsertMoneySavingsGoalInput,
} from "./moneySavingsGoals";

export {
  addMoneySavingsContribution,
  deleteMoneySavingsContribution,
  getMoneySavingsContributionById,
  listMoneySavingsContributions,
  type AddMoneySavingsContributionInput,
} from "./moneySavingsContributions";
