import { describe, expect, it } from "vitest";
import {
  adminUserRoleBodySchema,
  epicUpsertBodySchema,
  feedQuerySchema,
  forgotPasswordBodySchema,
  loginBodySchema,
  logoutBodySchema,
  postReactionBodySchema,
  postCommentCreateBodySchema,
  postCreateBodySchema,
  refreshBodySchema,
  resetPasswordBodySchema,
  signupBodySchema,
  tasksListQuerySchema,
  epicsListQuerySchema,
  taskUpsertBodySchema,
  timerStartBodySchema,
  chatSendBodySchema,
  chatStartBodySchema,
  postCommentsQuerySchema,
  verifyEmailBodySchema,
} from "../server/schemas";
import { TaskPriority, TaskStatus, UserRole } from "../types/task";
import { ChatMessageKind } from "../types/chat";
import { PostFormat, PostVisibility } from "../types/post";

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

describe("signup / refresh / logout schemas", () => {
  it("requires a non-empty name on signup", () => {
    expect(
      signupBodySchema.safeParse({
        email: "a@b.com",
        password: "Secret1!",
      }).success,
    ).toBe(false);
    expect(
      signupBodySchema.safeParse({
        email: "a@b.com",
        password: "Secret1!",
        name: "   ",
      }).success,
    ).toBe(false);
    expect(
      signupBodySchema.safeParse({
        email: "a@b.com",
        password: "Secret1!",
        name: "Ada",
      }).success,
    ).toBe(true);
  });

  it("defaults empty refresh/logout bodies", () => {
    expect(refreshBodySchema.safeParse(undefined).success).toBe(true);
    expect(logoutBodySchema.safeParse(undefined).success).toBe(true);
  });
});

describe("verify / forgot / reset schemas", () => {
  it("requires token for verify and reset", () => {
    expect(verifyEmailBodySchema.safeParse({}).success).toBe(false);
    expect(
      resetPasswordBodySchema.safeParse({ password: "Secret1!" }).success,
    ).toBe(false);
  });

  it("requires a valid email for forgot-password", () => {
    expect(forgotPasswordBodySchema.safeParse({ email: "nope" }).success).toBe(
      false,
    );
    expect(
      forgotPasswordBodySchema.safeParse({ email: "a@b.com" }).success,
    ).toBe(true);
  });
});

describe("postReactionBodySchema", () => {
  it("accepts known reactions", () => {
    expect(postReactionBodySchema.safeParse({ reaction: 0 }).success).toBe(
      true,
    );
    expect(postReactionBodySchema.safeParse({ reaction: 5 }).success).toBe(
      true,
    );
  });

  it("rejects unknown reactions", () => {
    expect(postReactionBodySchema.safeParse({ reaction: "like" }).success).toBe(
      false,
    );
    expect(postReactionBodySchema.safeParse({ reaction: 9 }).success).toBe(
      false,
    );
  });
});

describe("postCreateBodySchema", () => {
  it("accepts integer visibility and format", () => {
    const parsed = postCreateBodySchema.safeParse({
      body: "Hello feed",
      format: PostFormat.Manuscript,
      title: "A manuscript",
      visibility: PostVisibility.Shared,
      audienceUserIds: ["user_abc"],
    });
    expect(parsed.success).toBe(true);
  });

  it("defaults omitted visibility to Friends", () => {
    const parsed = postCreateBodySchema.safeParse({
      body: "Hello feed",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.visibility).toBe(PostVisibility.Friends);
    }
  });

  it("accepts Friends visibility", () => {
    const parsed = postCreateBodySchema.safeParse({
      body: "Hello friends",
      visibility: PostVisibility.Friends,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects string visibility and format", () => {
    expect(
      postCreateBodySchema.safeParse({
        body: "Hello feed",
        format: "manuscript",
        title: "A manuscript",
      }).success,
    ).toBe(false);
    expect(
      postCreateBodySchema.safeParse({
        body: "Hello feed",
        visibility: "public",
      }).success,
    ).toBe(false);
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

describe("task and epic list query schemas", () => {
  it("defaults list pages to 100 and parses cursors", () => {
    expect(tasksListQuerySchema.parse({}).limit).toBe(100);
    expect(epicsListQuerySchema.parse({}).limit).toBe(100);
    expect(
      tasksListQuerySchema.parse({ limit: "25", cursor: "cursor_1" }),
    ).toMatchObject({ limit: 25, cursor: "cursor_1" });
  });

  it("caps requested pages at 200", () => {
    expect(tasksListQuerySchema.safeParse({ limit: 201 }).success).toBe(false);
    expect(epicsListQuerySchema.safeParse({ limit: 201 }).success).toBe(false);
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

  it("accepts optional categoryId", () => {
    expect(
      feedQuerySchema.parse({ categoryId: "cat_electronics" }).categoryId,
    ).toBe("cat_electronics");
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

describe("postCommentsQuerySchema", () => {
  it("defaults limit to 30", () => {
    const parsed = postCommentsQuerySchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.limit).toBe(30);
  });

  it("accepts before cursor", () => {
    const parsed = postCommentsQuerySchema.safeParse({
      before: "2026-07-31T00:00:00.000Z",
      limit: "10",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.limit).toBe(10);
      expect(parsed.data.before).toBe("2026-07-31T00:00:00.000Z");
    }
  });
});

describe("postCommentCreateBodySchema", () => {
  it("requires a non-empty body", () => {
    expect(postCommentCreateBodySchema.safeParse({ body: "" }).success).toBe(
      false,
    );
    expect(
      postCommentCreateBodySchema.safeParse({ body: "  hi  " }).success,
    ).toBe(true);
  });

  it("rejects bodies over 2000 chars", () => {
    expect(
      postCommentCreateBodySchema.safeParse({ body: "x".repeat(2001) }).success,
    ).toBe(false);
  });
});

describe("adminUserRoleBodySchema", () => {
  it("accepts assignable integer roles only", () => {
    expect(
      adminUserRoleBodySchema.safeParse({ role: UserRole.Admin }).success,
    ).toBe(true);
    expect(
      adminUserRoleBodySchema.safeParse({ role: UserRole.Normal }).success,
    ).toBe(true);
    expect(
      adminUserRoleBodySchema.safeParse({ role: UserRole.Superadmin }).success,
    ).toBe(false);
    expect(adminUserRoleBodySchema.safeParse({ role: "admin" }).success).toBe(
      false,
    );
  });
});
