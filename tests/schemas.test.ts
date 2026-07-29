import { describe, expect, it } from "vitest";
import {
  epicUpsertBodySchema,
  feedQuerySchema,
  loginBodySchema,
  taskUpsertBodySchema,
  timerStartBodySchema,
  chatSendBodySchema,
  chatStartBodySchema,
} from "../server/schemas";
import { TaskPriority, TaskStatus } from "../types/task";
import { ChatMessageKind } from "../types/chat";

describe("loginBodySchema", () => {
  it("accepts a valid email/password", () => {
    const parsed = loginBodySchema.safeParse({
      email: "a@b.com",
      password: "x",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects missing password", () => {
    const parsed = loginBodySchema.safeParse({ email: "a@b.com" });
    expect(parsed.success).toBe(false);
  });
});

describe("taskUpsertBodySchema", () => {
  it("requires a non-empty title", () => {
    const parsed = taskUpsertBodySchema.safeParse({ title: "  " });
    expect(parsed.success).toBe(false);
  });

  it("rejects string enums (integer-only wire format)", () => {
    const parsed = taskUpsertBodySchema.safeParse({
      title: "Hello",
      status: "done",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts integer status/priority", () => {
    const parsed = taskUpsertBodySchema.safeParse({
      title: "Hello",
      status: TaskStatus.Done,
      priority: TaskPriority.High,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects out-of-range status", () => {
    const parsed = taskUpsertBodySchema.safeParse({
      title: "Hello",
      status: 99,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("epicUpsertBodySchema", () => {
  it("rejects unknown colors", () => {
    const parsed = epicUpsertBodySchema.safeParse({
      title: "Epic",
      color: "neon",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts brand color", () => {
    const parsed = epicUpsertBodySchema.safeParse({
      title: "Epic",
      color: "brand",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("timerStartBodySchema", () => {
  it("requires taskId", () => {
    expect(timerStartBodySchema.safeParse({}).success).toBe(false);
    expect(timerStartBodySchema.safeParse({ taskId: "task_1" }).success).toBe(
      true,
    );
  });
});

describe("feedQuerySchema", () => {
  it("clamps limit into 1..50 with default 20", () => {
    expect(feedQuerySchema.parse({}).limit).toBe(20);
    expect(feedQuerySchema.parse({ limit: "5" }).limit).toBe(5);
    expect(feedQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(feedQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
  });
});

describe("chatStartBodySchema", () => {
  it("requires peerUserId", () => {
    expect(chatStartBodySchema.safeParse({}).success).toBe(false);
    expect(
      chatStartBodySchema.safeParse({ peerUserId: "user_abc" }).success,
    ).toBe(true);
  });
});

describe("chatSendBodySchema", () => {
  it("defaults to text and requires body", () => {
    expect(chatSendBodySchema.safeParse({}).success).toBe(false);
    const parsed = chatSendBodySchema.safeParse({ body: "hello" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.kind).toBe(ChatMessageKind.Text);
    }
  });

  it("accepts emoji kind with body", () => {
    const parsed = chatSendBodySchema.safeParse({
      kind: ChatMessageKind.Emoji,
      body: "🎉",
    });
    expect(parsed.success).toBe(true);
  });

  it("requires stickerId for sticker kind", () => {
    expect(
      chatSendBodySchema.safeParse({ kind: ChatMessageKind.Sticker }).success,
    ).toBe(false);
    expect(
      chatSendBodySchema.safeParse({
        kind: ChatMessageKind.Sticker,
        stickerId: "wave",
      }).success,
    ).toBe(true);
  });

  it("rejects string kinds", () => {
    expect(
      chatSendBodySchema.safeParse({ kind: "text", body: "x" }).success,
    ).toBe(false);
  });

  it("requires uploadId for image and audio", () => {
    expect(
      chatSendBodySchema.safeParse({ kind: ChatMessageKind.Image }).success,
    ).toBe(false);
    expect(
      chatSendBodySchema.safeParse({
        kind: ChatMessageKind.Image,
        uploadId: "upl_abc",
      }).success,
    ).toBe(true);
    expect(
      chatSendBodySchema.safeParse({
        kind: ChatMessageKind.Audio,
        uploadId: "upl_abc",
      }).success,
    ).toBe(false);
    expect(
      chatSendBodySchema.safeParse({
        kind: ChatMessageKind.Audio,
        uploadId: "upl_abc",
        durationMs: 1500,
      }).success,
    ).toBe(true);
  });
});
