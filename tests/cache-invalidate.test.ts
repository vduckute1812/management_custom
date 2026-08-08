import { beforeEach, describe, expect, it, vi } from "vitest";
import { PostVisibility } from "../types/post";

const cacheDelPrefix = vi.fn();
const cacheDel = vi.fn();
const listAcceptedFriendIds = vi.fn();
const invalidateUploadAccessCacheForViewers = vi.fn();
const invalidateAllUploadAccessCaches = vi.fn();

vi.mock("../server/utils/cache", () => ({
  CacheKeys: {
    categories: () => "categories",
    categoriesPrefix: () => "categories:",
    feedPublicPrefix: () => "feed:public:",
    feedAuthAllPrefix: () => "feed:auth:",
    feedAuthPrefix: (userId: string) => `feed:auth:${userId}:`,
  },
  cacheDel: (...args: unknown[]) => cacheDel(...args),
  cacheDelPrefix: (...args: unknown[]) => cacheDelPrefix(...args),
}));

vi.mock("../server/db/friends/friendshipCache", () => ({
  listAcceptedFriendIds: (...args: unknown[]) => listAcceptedFriendIds(...args),
}));

vi.mock("../server/db/feed/uploadAccess", () => ({
  invalidateUploadAccessCacheForViewers: (...args: unknown[]) =>
    invalidateUploadAccessCacheForViewers(...args),
  invalidateAllUploadAccessCaches: (...args: unknown[]) =>
    invalidateAllUploadAccessCaches(...args),
}));

const {
  collectPostMutationAudienceViewers,
  postMutationCacheTouches,
  invalidateFeedCachesAfterPostMutation,
} = await import("../server/utils/cacheInvalidate");

describe("postMutationCacheTouches", () => {
  it("detects public on create and on leave/enter", () => {
    expect(
      postMutationCacheTouches({ visibility: PostVisibility.Public }),
    ).toEqual({ touchesPublic: true, touchesFriends: false });
    expect(
      postMutationCacheTouches({
        previousVisibility: PostVisibility.Public,
        visibility: PostVisibility.Private,
      }),
    ).toEqual({ touchesPublic: true, touchesFriends: false });
    expect(
      postMutationCacheTouches({
        previousVisibility: PostVisibility.Friends,
        visibility: PostVisibility.Public,
      }),
    ).toEqual({ touchesPublic: true, touchesFriends: true });
  });

  it("detects friends transitions without public", () => {
    expect(
      postMutationCacheTouches({
        previousVisibility: PostVisibility.Friends,
        visibility: PostVisibility.Private,
      }),
    ).toEqual({ touchesPublic: false, touchesFriends: true });
    expect(
      postMutationCacheTouches({ visibility: PostVisibility.Friends }),
    ).toEqual({ touchesPublic: false, touchesFriends: true });
  });
});

describe("collectPostMutationAudienceViewers", () => {
  it("unions actor with previous and next shared audiences", () => {
    expect(
      collectPostMutationAudienceViewers({
        actorId: "author",
        previousAudienceUserIds: ["a", "b"],
        audienceUserIds: ["b", "c"],
      }).sort(),
    ).toEqual(["a", "author", "b", "c"]);
  });
});

describe("invalidateFeedCachesAfterPostMutation", () => {
  beforeEach(() => {
    cacheDelPrefix.mockReset();
    cacheDel.mockReset();
    listAcceptedFriendIds.mockReset();
    invalidateUploadAccessCacheForViewers.mockReset();
    invalidateAllUploadAccessCaches.mockReset();
    listAcceptedFriendIds.mockResolvedValue(["friend_1", "friend_2"]);
  });

  it("public mutations clear all feed prefixes and upload ACL", async () => {
    await invalidateFeedCachesAfterPostMutation({
      actorId: "author",
      visibility: PostVisibility.Public,
    });
    expect(cacheDelPrefix).toHaveBeenCalledWith("feed:public:");
    expect(cacheDelPrefix).toHaveBeenCalledWith("feed:auth:");
    expect(invalidateAllUploadAccessCaches).toHaveBeenCalled();
    expect(listAcceptedFriendIds).not.toHaveBeenCalled();
    expect(invalidateUploadAccessCacheForViewers).not.toHaveBeenCalled();
  });

  it("friends mutations bust actor + accepted friends + upload ACL", async () => {
    await invalidateFeedCachesAfterPostMutation({
      actorId: "author",
      visibility: PostVisibility.Friends,
    });
    expect(listAcceptedFriendIds).toHaveBeenCalledWith("author");
    expect(cacheDelPrefix).toHaveBeenCalledWith("feed:auth:author:");
    expect(cacheDelPrefix).toHaveBeenCalledWith("feed:auth:friend_1:");
    expect(cacheDelPrefix).toHaveBeenCalledWith("feed:auth:friend_2:");
    expect(invalidateUploadAccessCacheForViewers).toHaveBeenCalledWith(
      expect.arrayContaining(["author", "friend_1", "friend_2"]),
    );
    expect(invalidateAllUploadAccessCaches).not.toHaveBeenCalled();
  });

  it("shared update busts removed and remaining audience members", async () => {
    await invalidateFeedCachesAfterPostMutation({
      actorId: "author",
      previousVisibility: PostVisibility.Shared,
      visibility: PostVisibility.Shared,
      previousAudienceUserIds: ["old_peer", "keep"],
      audienceUserIds: ["keep", "new_peer"],
    });
    expect(listAcceptedFriendIds).not.toHaveBeenCalled();
    for (const id of ["author", "old_peer", "keep", "new_peer"]) {
      expect(cacheDelPrefix).toHaveBeenCalledWith(`feed:auth:${id}:`);
    }
    expect(invalidateUploadAccessCacheForViewers).toHaveBeenCalledWith(
      expect.arrayContaining(["author", "old_peer", "keep", "new_peer"]),
    );
  });

  it("friends→private still busts friends who lost access", async () => {
    await invalidateFeedCachesAfterPostMutation({
      actorId: "author",
      previousVisibility: PostVisibility.Friends,
      visibility: PostVisibility.Private,
    });
    expect(listAcceptedFriendIds).toHaveBeenCalledWith("author");
    expect(cacheDelPrefix).toHaveBeenCalledWith("feed:auth:friend_1:");
    expect(invalidateUploadAccessCacheForViewers).toHaveBeenCalled();
  });

  it("private-only mutations bust only the actor", async () => {
    await invalidateFeedCachesAfterPostMutation({
      actorId: "author",
      visibility: PostVisibility.Private,
    });
    expect(listAcceptedFriendIds).not.toHaveBeenCalled();
    expect(cacheDelPrefix).toHaveBeenCalledTimes(1);
    expect(cacheDelPrefix).toHaveBeenCalledWith("feed:auth:author:");
    expect(invalidateUploadAccessCacheForViewers).toHaveBeenCalledWith([
      "author",
    ]);
  });
});
