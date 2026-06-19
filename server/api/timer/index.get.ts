import { getActiveTimer } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const activeTimer = await getActiveTimer(user.sub);
  return { activeTimer };
});
