import { describe, expect, it } from "vitest";
import { shouldFetchMoreLocaleRows } from "../server/db/feed/postQuery/hydration";

describe("locale feed pagination", () => {
  it("continues after a full batch collapses below the target", () => {
    const rows = Array.from({ length: 11 }, (_, index) => ({
      id: `post_${index}`,
      translation_group_id: index < 10 ? "group_a" : null,
    }));

    expect(shouldFetchMoreLocaleRows(rows, 3, true)).toBe(true);
    expect(
      shouldFetchMoreLocaleRows(
        [
          ...rows,
          { id: "post_11", translation_group_id: null },
          { id: "post_12", translation_group_id: null },
        ],
        3,
        true,
      ),
    ).toBe(false);
  });

  it("stops when the database returns a partial final batch", () => {
    const rows = [
      { id: "post_1", translation_group_id: "group_a" },
      { id: "post_2", translation_group_id: "group_a" },
    ];

    expect(shouldFetchMoreLocaleRows(rows, 3, false)).toBe(false);
  });
});
