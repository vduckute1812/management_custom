/**
 * Assert that deleting a user leaves no owned rows and no email-targeted jobs.
 *
 *   node --env-file=.env --import tsx scripts/verify-user-delete-cascade.ts
 *
 * Seeds a throwaway account with task / post / comment / chat / money / story
 * (legacy media key) / pending email job, deletes the account, then fails if
 * any owned row or job for that email remains. The peer account must survive.
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
} from "../server/utils/db";
import { deleteUserAccount } from "../server/services/accountDeletionService";
import { generateId, nowISO } from "../server/db/ids";
import { isoToDB } from "../server/db/datetime";

const VICTIM_EMAIL = "cascade-victim@example.com";
const PEER_EMAIL = "cascade-peer@example.com";
const PASSWORD = "cascade-check-1";

const OWNED_TABLES: Array<{ table: string; column: string }> = [
  { table: "tasks", column: "user_id" },
  { table: "epics", column: "user_id" },
  { table: "active_timer", column: "user_id" },
  { table: "posts", column: "user_id" },
  { table: "post_comments", column: "user_id" },
  { table: "post_reactions", column: "user_id" },
  { table: "post_audience", column: "user_id" },
  { table: "uploads", column: "user_id" },
  { table: "stories", column: "user_id" },
  { table: "story_views", column: "user_id" },
  { table: "story_reactions", column: "user_id" },
  { table: "chat_messages", column: "sender_id" },
  { table: "chat_conversation_reads", column: "user_id" },
  { table: "chat_message_reactions", column: "user_id" },
  { table: "auth_refresh_tokens", column: "user_id" },
  { table: "auth_email_verifications", column: "user_id" },
  { table: "auth_password_resets", column: "user_id" },
  { table: "auth_identities", column: "user_id" },
  { table: "money_transactions", column: "user_id" },
  { table: "money_savings_goals", column: "user_id" },
  { table: "money_savings_contributions", column: "user_id" },
  { table: "money_budgets", column: "user_id" },
];

async function ensureUser(email: string, name: string) {
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
  const pool = getPool();
  // Start clean so a previous failed run cannot leave false positives.
  for (const email of [VICTIM_EMAIL, PEER_EMAIL]) {
    const u = await getUserByEmail(email);
    if (u) await deleteUserAccount(u.id);
  }

  const victim = await ensureUser(VICTIM_EMAIL, "Cascade Victim");
  const peer = await ensureUser(PEER_EMAIL, "Cascade Peer");
  const now = nowISO();

  await upsertTask(victim.id, {
    id: generateId("task"),
    title: "must vanish",
    status: TaskStatus.Todo,
    priority: TaskPriority.Normal,
    createdAt: now,
    updatedAt: now,
  });

  const victimPost = await createPost(victim.id, { body: "victim post" });
  const peerPost = await createPost(peer.id, { body: "peer post" });
  await createPostComment(victim.id, peerPost.id, "victim comment on peer");
  // Peer shares the victim's post — after delete, shared_post_id becomes NULL.
  await createPost(peer.id, {
    body: "peer share of victim",
    sharedPostId: victimPost.id,
  });

  const conversation = await getOrCreateDirectConversation(victim.id, peer.id);
  await sendMessage(victim.id, conversation.id, {
    kind: ChatMessageKind.Text,
    body: "from victim",
  });
  await sendMessage(peer.id, conversation.id, {
    kind: ChatMessageKind.Text,
    body: "from peer",
  });

  await upsertMoneyTransaction(victim.id, {
    occurredOn: now.slice(0, 10),
    amountMinor: 12000,
    direction: MoneyDirection.Out,
    category: MoneyCategory.Food,
    note: "snack",
  });

  // Legacy story row: media key with no uploads row — R2 sweep must still see it.
  const storyId = generateId("story");
  await pool.query(
    `INSERT INTO stories
       (id, user_id, body, upload_id, media_storage_key, mime, created_at, expires_at)
     VALUES (?, ?, ?, NULL, ?, 'image/jpeg', ?, DATE_ADD(?, INTERVAL 1 DAY))`,
    [
      storyId,
      victim.id,
      "legacy story",
      `uploads/image/2099/01/${storyId}_legacy.jpg`,
      isoToDB(now),
      isoToDB(now),
    ],
  );

  await pool.query(
    `INSERT INTO jobs
       (id, type, payload, status, attempts, max_attempts, available_at,
        locked_at, locked_by, last_error, created_at, updated_at)
     VALUES (?, 'email.verification', ?, 0, 0, 5, ?, NULL, NULL, NULL, ?, ?)`,
    [
      generateId("job"),
      JSON.stringify({ to: VICTIM_EMAIL, token: "dead-token-should-go" }),
      isoToDB(now),
      isoToDB(now),
      isoToDB(now),
    ],
  );
  await pool.query(
    `INSERT INTO jobs
       (id, type, payload, status, attempts, max_attempts, available_at,
        locked_at, locked_by, last_error, created_at, updated_at)
     VALUES (?, 'email.send', ?, 0, 0, 5, ?, NULL, NULL, NULL, ?, ?)`,
    [
      generateId("job"),
      JSON.stringify({
        to: PEER_EMAIL,
        subject: "keep me",
        text: "peer mail must survive",
      }),
      isoToDB(now),
      isoToDB(now),
      isoToDB(now),
    ],
  );

  const removed = await deleteUserAccount(victim.id);
  if (!removed) throw new Error("deleteUserAccount returned false");

  const leftovers: string[] = [];
  for (const { table, column } of OWNED_TABLES) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`,
      [victim.id],
    );
    const n = Number(rows[0]?.n ?? 0);
    if (n > 0) leftovers.push(`${table}.${column}=${n}`);
  }

  const [convRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM chat_conversations
     WHERE user_a_id = ? OR user_b_id = ?`,
    [victim.id, victim.id],
  );
  if (Number(convRows[0]?.n ?? 0) > 0) {
    leftovers.push("chat_conversations");
  }

  const [userRows] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS n FROM users WHERE id = ?",
    [victim.id],
  );
  if (Number(userRows[0]?.n ?? 0) > 0) leftovers.push("users");

  const [jobRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM jobs
     WHERE LOWER(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.to'))) = ?`,
    [VICTIM_EMAIL],
  );
  if (Number(jobRows[0]?.n ?? 0) > 0) leftovers.push("jobs.payload.to");

  const [peerJobRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM jobs
     WHERE LOWER(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.to'))) = ?`,
    [PEER_EMAIL],
  );
  if (Number(peerJobRows[0]?.n ?? 0) !== 1) {
    leftovers.push(`peer jobs expected 1 got ${peerJobRows[0]?.n}`);
  }

  const peerStill = await getUserByEmail(PEER_EMAIL);
  if (!peerStill) leftovers.push("peer user missing");

  const [peerPostRows] = await pool.query<RowDataPacket[]>(
    "SELECT id, shared_post_id, comment_count FROM posts WHERE user_id = ?",
    [peer.id],
  );
  const share = peerPostRows.find((r) => r.id !== peerPost.id);
  if (!share) leftovers.push("peer share post missing");
  else if (share.shared_post_id != null) {
    leftovers.push(`share.shared_post_id still ${share.shared_post_id}`);
  }
  const surviving = peerPostRows.find((r) => r.id === peerPost.id);
  if (Number(surviving?.comment_count ?? -1) !== 0) {
    leftovers.push(
      `peer post comment_count expected 0 got ${surviving?.comment_count}`,
    );
  }

  if (leftovers.length) {
    console.error("CASCADE INCOMPLETE:", leftovers);
    process.exitCode = 1;
  } else {
    console.log("CASCADE OK — no owned leftovers; peer data intact");
  }
  await pool.end();
}

void main();
