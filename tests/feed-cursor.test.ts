import { describe, expect, it } from "vitest";
import { encodeFeedCursor, parseFeedCursor } from "../server/db/postQueries";

describe("feed cursor", () => {
  it("round-trips createdAt|id", () => {
    const createdAt = "2026-07-31T07:00:00.000Z";
    const id = "post_abc123";
    const token = encodeFeedCursor(createdAt, id);
    expect(token).toBe(`${createdAt}|${id}`);
    expect(parseFeedCursor(token)).toEqual({ createdAt, id });
  });

  it("accepts legacy ISO-only cursors", () => {
    const createdAt = "2026-07-31T07:00:00.000Z";
    expect(parseFeedCursor(createdAt)).toEqual({
      createdAt,
      id: null,
    });
  });

  it("trims whitespace", () => {
    expect(parseFeedCursor("  2026-07-31T07:00:00.000Z|post_x  ")).toEqual({
      createdAt: "2026-07-31T07:00:00.000Z",
      id: "post_x",
    });
  });
});
