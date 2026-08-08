import { describe, expect, it } from "vitest";
import {
  encodeTimestampCursor,
  parseTimestampCursor,
} from "../server/db/core/timestampCursor";

describe("timestamp cursor", () => {
  it("round-trips a timestamp and stable id", () => {
    const cursor = encodeTimestampCursor(
      "2026-08-07T16:30:00.123Z",
      "chat_123",
    );

    expect(parseTimestampCursor(cursor)).toEqual({
      timestamp: "2026-08-07T16:30:00.123Z",
      id: "chat_123",
    });
  });

  it.each(["", "not-a-date|chat_123", "2026-08-07T16:30:00.123Z"])(
    "rejects malformed cursor %j",
    (cursor) => {
      expect(() => parseTimestampCursor(cursor)).toThrow("Invalid cursor");
    },
  );
});
