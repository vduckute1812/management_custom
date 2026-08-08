import { describe, expect, it } from "vitest";
import { generateId } from "../server/db/core/ids";
import { newClientId } from "../utils/clientId";

/**
 * Ids are primary keys, and the client mints some of them itself (time blocks
 * and checklist items are inserted verbatim by `upsertTask`). These tests pin
 * the properties that matter: enough entropy that collisions are not a
 * practical concern, and a lowercase-hex alphabet, because every id column
 * uses the case-insensitive `utf8mb4_unicode_ci` collation.
 */

const HEX_24 = /^[0-9a-f]{24}$/;

describe("generateId", () => {
  it("emits a prefix and 24 lowercase hex characters", () => {
    const id = generateId("post");
    const [prefix, rand, ...extra] = id.split("_");
    expect(prefix).toBe("post");
    expect(extra).toHaveLength(0);
    expect(rand).toMatch(HEX_24);
  });

  it("is fixed width — the old Math.random form could emit fewer digits", () => {
    for (let i = 0; i < 500; i++) {
      expect(generateId("msg")).toHaveLength("msg_".length + 24);
    }
  });

  it("does not repeat across a large sample", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i++) seen.add(generateId("cmt"));
    expect(seen.size).toBe(20_000);
  });
});

describe("newClientId", () => {
  it("matches the server id shape so both are safe as primary keys", () => {
    const id = newClientId("block");
    expect(id.startsWith("block_")).toBe(true);
    expect(id.slice("block_".length)).toMatch(HEX_24);
  });

  it("does not repeat across a large sample", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i++) seen.add(newClientId("chk"));
    expect(seen.size).toBe(20_000);
  });
});
