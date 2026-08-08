/**
 * Friendships — Facebook-style request / accept graph.
 * Split across sibling modules; this file re-exports the public API.
 */

export type { FriendshipPage } from "./friendshipShared";
export {
  listAcceptedFriendIds,
  invalidateAcceptedFriendIdsCache,
} from "./friendshipCache";
export {
  areFriends,
  countIncomingFriendRequests,
  listFriends,
  listIncomingFriendRequests,
  listOutgoingFriendRequests,
  listFriendshipOverview,
} from "./friendshipReads";
export {
  requestFriendship,
  acceptFriendship,
  deleteFriendship,
} from "./friendshipMutations";
