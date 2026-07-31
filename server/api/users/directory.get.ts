import { searchUserDirectory } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { parseQuery } from "~/server/utils/http";
import { userDirectoryQuerySchema } from "~/server/schemas";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const { q, limit } = parseQuery(event, userDirectoryQuerySchema);
  const users = await searchUserDirectory(user.sub, q, limit);
  return { users };
});
