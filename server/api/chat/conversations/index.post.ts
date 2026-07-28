import { getOrCreateDirectConversation } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { parseBody, mapDomainError } from "~/server/utils/http";
import { chatStartBodySchema } from "~/server/schemas";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const body = await parseBody(event, chatStartBodySchema);
  try {
    const conversation = await getOrCreateDirectConversation(
      user.sub,
      body.peerUserId,
    );
    return { conversation };
  } catch (err) {
    mapDomainError(err);
  }
});
