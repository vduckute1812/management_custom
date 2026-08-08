/**
 * Local fixture for exercising self-service account deletion by hand.
 *
 *   node --env-file=.env --import tsx scripts/seed-delete-account-fixture.ts
 *
 * Creates two verified accounts and gives the first one something in every
 * module the delete has to reach — task, feed post, chat (both directions),
 * money row — plus a comment on the *other* user's post so the comment-count
 * recount has work to do. Prints row counts, so running it again after a
 * deletion shows exactly what went and what stayed.
 *
 * Local only: it writes accounts whose password is printed on screen.
 */
import type { RowDataPacket } from "mysql2/promise";
import { hashPassword } from "../server/utils/auth";
import { TaskStatus, TaskPriority } from "../types/task";
import { ChatMessageKind } from "../types/chat";
import { MoneyCategory, MoneyDirection } from "../types/money";
import {
  createPost,
  createPostComment,
  createUser,
  getOrCreateDirectConversation,
  getPool,
  getUserByEmail,
  sendMessage,
  upsertMoneyTransaction,
  upsertTask,
  type UserRecord,
} from "../server/utils/db";
import { generateId, nowISO } from "../server/db/core/ids";

const PASSWORD = "delete-me-please-1";

const COUNTED_TABLES = [
  "users",
  "tasks",
  "posts",
  "post_comments",
  "chat_conversations",
  "chat_messages",
  "money_transactions",
] as const;

async function ensureUser(email: string, name: string): Promise<UserRecord> {
  const existing = await getUserByEmail(email);
  if (existing) return existing;
  return createUser({
    email,
    passwordHash: await hashPassword(PASSWORD),
    name,
    emailVerified: true,
  });
}

async function main() {
  const victim = await ensureUser("delete-me@example.com", "Delete Me");
  const peer = await ensureUser("keeps-account@example.com", "Stays Behind");

  const now = nowISO();
  await upsertTask(victim.id, {
    id: generateId("task"),
    title: "Task that must disappear",
    status: TaskStatus.Todo,
    priority: TaskPriority.Normal,
    createdAt: now,
    updatedAt: now,
  });

  const victimPost = await createPost(victim.id, {
    body: "Post by the account being deleted",
  });
  const peerPost = await createPost(peer.id, {
    body: "Post that survives, with a comment from the deleted account",
  });
  await createPostComment(peer.id, peerPost.id, "comment from the peer");
  await createPostComment(
    victim.id,
    peerPost.id,
    "comment from the account being deleted",
  );

  const conversation = await getOrCreateDirectConversation(victim.id, peer.id);
  await sendMessage(victim.id, conversation.id, {
    kind: ChatMessageKind.Text,
    body: "message from the account being deleted",
  });
  await sendMessage(peer.id, conversation.id, {
    kind: ChatMessageKind.Text,
    body: "reply from the peer",
  });

  await upsertMoneyTransaction(victim.id, {
    occurredOn: now.slice(0, 10),
    amountMinor: 45000,
    direction: MoneyDirection.Out,
    category: MoneyCategory.Food,
    note: "lunch",
  });

  const pool = getPool();
  const counts: Record<string, number> = {};
  for (const table of COUNTED_TABLES) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM ${table}`,
    );
    counts[table] = Number(rows[0]?.n ?? 0);
  }
  const [commentCounts] = await pool.query<RowDataPacket[]>(
    "SELECT id, comment_count FROM posts ORDER BY created_at",
  );

  console.log(`victim: ${victim.id} ${victim.email} password=${PASSWORD}`);
  console.log(`peer:   ${peer.id} ${peer.email} password=${PASSWORD}`);
  console.log(`victim post: ${victimPost.id}  peer post: ${peerPost.id}`);
  console.log("counts:", counts);
  console.log("posts.comment_count:", commentCounts);
  await pool.end();
}

void main();
