import { describe, expect, it } from "vitest";
import * as db from "../server/utils/db";

describe("server/utils/db public surface", () => {
  it("does not re-export test-only helpers", () => {
    const leaked = Object.keys(db).filter(
      (name) => name.startsWith("_") || name.endsWith("ForTests"),
    );
    expect(leaked).toEqual([]);
  });

  it("exposes the hot-path upload resolver without export * leakage", () => {
    expect(typeof db.resolveUploadForViewer).toBe("function");
    expect(typeof db.getPool).toBe("function");
    expect(typeof db.toAuthUser).toBe("function");
  });
});
