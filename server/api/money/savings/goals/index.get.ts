import { requireUser } from "~/server/utils/authContext";
import { listMoneySavingsGoalsForUser } from "~/server/services/moneySavingsService";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  return listMoneySavingsGoalsForUser(user.sub);
});
