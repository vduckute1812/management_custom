/**
 * Hydrates `event.context.user` from a Bearer token on every request.
 * Never blocks — protected routes call `requireUser(event)` themselves.
 */
import { attachUserFromHeader } from "~/server/utils/authContext";

export default defineEventHandler((event) => {
  attachUserFromHeader(event);
});
