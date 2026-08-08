import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UploadKind } from "../types/post";
import type { UploadRow } from "../server/db/feed/uploadShared";

const query = vi.fn();
const listAcceptedFriendIds = vi.fn();

vi.mock("../server/db/core/pool", () => ({
  getPool: () => ({ query }),
}));

vi.mock("../server/db/friends/friendshipCache", () => ({
  listAcceptedFriendIds: (...args: unknown[]) => listAcceptedFriendIds(...args),
}));

const {
  canViewerAccessUpload,
  resolveUploadForViewer,
  invalidateUploadAccessCacheForViewer,
  _resetUploadAccessCachesForTests,
  _uploadAccessCacheSizeForTests,
} = await import("../server/db/feed/uploadAccess");

function sampleRow(overrides: Partial<UploadRow> = {}): UploadRow {
  return {
    id: "upl_1",
    user_id: "user_owner",
    file_name: "a.jpg",
    mime: "image/jpeg",
    kind: UploadKind.Image,
    size_bytes: 12,
    storage_key: "image/upl_1",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as UploadRow;
}

describe("upload ACL positive row cache", () => {
  beforeEach(() => {
    _resetUploadAccessCachesForTests();
    query.mockReset();
    listAcceptedFriendIds.mockReset();
    listAcceptedFriendIds.mockResolvedValue([]);
  });

  afterEach(() => {
    _resetUploadAccessCachesForTests();
    vi.useRealTimers();
  });

  it("miss loads via ACL SQL then remembers the row", async () => {
    const row = sampleRow();
    query.mockResolvedValueOnce([[row]]);

    const first = await resolveUploadForViewer("user_viewer", "upl_1");
    expect(first).toMatchObject({
      id: "upl_1",
      storage_key: "image/upl_1",
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(_uploadAccessCacheSizeForTests()).toBe(1);

    const second = await resolveUploadForViewer("user_viewer", "upl_1");
    expect(second).toMatchObject({ id: "upl_1", storage_key: "image/upl_1" });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("cache hit serves canViewerAccessUpload without SQL", async () => {
    query.mockResolvedValueOnce([[sampleRow()]]);
    await resolveUploadForViewer("user_a", "upl_1");
    query.mockClear();

    await expect(canViewerAccessUpload("user_a", "upl_1")).resolves.toBe(true);
    expect(query).not.toHaveBeenCalled();
  });

  it("deny stays uncached and returns null / false", async () => {
    query.mockResolvedValue([[]]);

    await expect(
      resolveUploadForViewer("user_stranger", "upl_missing"),
    ).resolves.toBeNull();
    await expect(
      canViewerAccessUpload("user_stranger", "upl_missing"),
    ).resolves.toBe(false);
    expect(_uploadAccessCacheSizeForTests()).toBe(0);
    // Authenticated miss: cheap own/avatar probe + full EXISTS tree, twice.
    expect(query).toHaveBeenCalledTimes(4);
    expect(listAcceptedFriendIds).toHaveBeenCalled();
  });

  it("expires after TTL and re-queries", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T10:00:00.000Z"));
    query.mockResolvedValue([[sampleRow()]]);

    await resolveUploadForViewer("user_a", "upl_1");
    expect(query).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-08-08T10:00:11.000Z"));
    await resolveUploadForViewer("user_a", "upl_1");
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("clones cached rows so callers cannot mutate the entry", async () => {
    query.mockResolvedValueOnce([[sampleRow()]]);
    const first = await resolveUploadForViewer("user_a", "upl_1");
    expect(first).not.toBeNull();
    first!.file_name = "mutated.jpg";

    const second = await resolveUploadForViewer("user_a", "upl_1");
    expect(second?.file_name).toBe("a.jpg");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("scopes cache entries by viewer id", async () => {
    query.mockResolvedValue([[sampleRow()]]);
    await resolveUploadForViewer("user_a", "upl_1");
    await resolveUploadForViewer("user_b", "upl_1");
    expect(query).toHaveBeenCalledTimes(2);
    expect(_uploadAccessCacheSizeForTests()).toBe(2);

    query.mockClear();
    await resolveUploadForViewer("user_a", "upl_1");
    await resolveUploadForViewer("user_b", "upl_1");
    expect(query).not.toHaveBeenCalled();
  });

  it("invalidateUploadAccessCacheForViewer drops only that viewer", async () => {
    query.mockResolvedValue([[sampleRow()]]);
    await resolveUploadForViewer("user_a", "upl_1");
    await resolveUploadForViewer("user_b", "upl_1");
    invalidateUploadAccessCacheForViewer("user_a");
    expect(_uploadAccessCacheSizeForTests()).toBe(1);

    query.mockClear();
    await resolveUploadForViewer("user_b", "upl_1");
    expect(query).not.toHaveBeenCalled();
    await resolveUploadForViewer("user_a", "upl_1");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("invalidateAllUploadAccessCaches clears every viewer", async () => {
    const { invalidateAllUploadAccessCaches } =
      await import("../server/db/feed/uploadAccess");
    query.mockResolvedValue([[sampleRow()]]);
    await resolveUploadForViewer("user_a", "upl_1");
    await resolveUploadForViewer("user_b", "upl_1");
    invalidateAllUploadAccessCaches();
    expect(_uploadAccessCacheSizeForTests()).toBe(0);
  });
});

describe("upload ACL cheap own/avatar path", () => {
  beforeEach(() => {
    _resetUploadAccessCachesForTests();
    query.mockReset();
    listAcceptedFriendIds.mockReset();
    listAcceptedFriendIds.mockResolvedValue(["friend_1"]);
  });

  afterEach(() => {
    _resetUploadAccessCachesForTests();
  });

  it("resolves own upload with one SQL and no friend-id lookup", async () => {
    query.mockResolvedValueOnce([
      [sampleRow({ user_id: "user_owner" } as Partial<UploadRow>)],
    ]);

    const row = await resolveUploadForViewer("user_owner", "upl_1");
    expect(row).toMatchObject({ id: "upl_1", user_id: "user_owner" });
    expect(query).toHaveBeenCalledTimes(1);
    expect(listAcceptedFriendIds).not.toHaveBeenCalled();
    const sql = String(query.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("u.user_id = ?");
    expect(sql).not.toContain("post_attachments");
  });

  it("falls through to full EXISTS when cheap path misses", async () => {
    query
      .mockResolvedValueOnce([[]]) // cheap own/avatar miss
      .mockResolvedValueOnce([
        [sampleRow({ user_id: "friend_1" } as Partial<UploadRow>)],
      ]); // full allow

    const row = await resolveUploadForViewer("user_viewer", "upl_1");
    expect(row).toMatchObject({ id: "upl_1" });
    expect(query).toHaveBeenCalledTimes(2);
    expect(listAcceptedFriendIds).toHaveBeenCalledWith("user_viewer");
    const fullSql = String(query.mock.calls[1]?.[0] ?? "");
    expect(fullSql).toContain("post_attachments");
    expect(fullSql).toContain("chat_messages");
  });
});
