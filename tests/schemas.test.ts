import { describe, expect, it } from "vitest";
import {
  epicUpsertBodySchema,
  feedQuerySchema,
  loginBodySchema,
  taskUpsertBodySchema,
  timerStartBodySchema,
} from "../server/schemas";
import { TaskPriority, TaskStatus } from "../types/task";

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
    expect(
      timerStartBodySchema.safeParse({ taskId: "task_1" }).success,
    ).toBe(true);
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
