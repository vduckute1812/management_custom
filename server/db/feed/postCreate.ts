/**
 * Create a feed post (with optional audience, attachments, share wrapper).
 */
import { DomainError } from "~/server/utils/http";
import type { RowDataPacket } from "mysql2/promise";
import { isoToDB } from "../core/datetime";
import { generateId, nowISO } from "../core/ids";
import { getPool } from "../core/pool";
import { assertOwnedUploads } from "./uploads";
import type { PostFontFamily, PostTextColor } from "~/types/post";
import {
  PostFormat,
  PostVisibility,
  toPostFormat,
  toPostVisibility,
} from "~/types/post";
import { getCategoryById } from "./categories";
import { isContentLocale } from "~/utils/contentLocale";
import { constrainShareWrapperAccess } from "../../utils/shareVisibility";
import {
  getPostById,
  normalizeFontFamily,
  normalizeTitle,
  normalizeTextColor,
} from "./postQueries";
import { insertAttachment, insertAudienceRows } from "./postWriteShared";

export async function createPost(
  userId: string,
  args: {
    body: string;
    title?: string | null;
    format?: PostFormat;
    visibility?: PostVisibility;
    audienceUserIds?: string[];
    attachmentIds?: string[];
    sharedPostId?: string | null;
    categoryId?: string | null;
    fontFamily?: PostFontFamily | null;
    textColor?: PostTextColor | null;
    contentLocale?: string | null;
    translationGroupId?: string | null;
  },
): Promise<import("../../../types/post").Post> {
  const pool = getPool();
  const id = generateId("post");
  const now = nowISO();
  const trimmed = args.body.trim();
  const format = toPostFormat(args.format);
  const title = normalizeTitle(args.title);
  if (format === PostFormat.Manuscript && !title) {
    throw new DomainError(400, "Manuscript title is required");
  }
  let visibility = toPostVisibility(args.visibility);
  let audienceUserIds =
    visibility === PostVisibility.Shared
      ? [
          ...new Set(
            (args.audienceUserIds ?? []).filter((x) => x && x !== userId),
          ),
        ]
      : [];

  if (args.sharedPostId) {
    const existing = await getPostById(userId, args.sharedPostId);
    if (!existing) {
      throw new DomainError(404, "Shared post not found");
    }
    const constrained = constrainShareWrapperAccess({
      originalVisibility: existing.visibility,
      originalAudienceIds: existing.audienceUserIds ?? [],
      originalAuthorId: existing.author.id,
      sharerUserId: userId,
      requestedVisibility: visibility,
      requestedAudienceIds: args.audienceUserIds ?? [],
    });
    visibility = constrained.visibility;
    audienceUserIds = constrained.audienceUserIds;
  }

  if (visibility === PostVisibility.Shared && audienceUserIds.length === 0) {
    throw new DomainError(
      400,
      "Shared posts require at least one audience member",
    );
  }

  const categoryId: string | null = args.categoryId?.trim() || null;
  if (categoryId) {
    const cat = await getCategoryById(categoryId);
    if (!cat) {
      throw new DomainError(400, "Invalid category");
    }
  }

  const fontFamily =
    format === PostFormat.Manuscript && !args.fontFamily
      ? ("serif" as PostFontFamily)
      : normalizeFontFamily(args.fontFamily);
  const textColor = normalizeTextColor(args.textColor);

  let contentLocale = "und";
  let translationGroupId: string | null = null;

  if (format === PostFormat.Manuscript) {
    contentLocale = isContentLocale(args.contentLocale)
      ? args.contentLocale
      : "vi";
    const requestedGroup = args.translationGroupId?.trim() || null;
    if (requestedGroup) {
      const [groupRows] = await pool.query<
        (RowDataPacket & {
          id: string;
          user_id: string;
          content_locale: string;
        })[]
      >(
        `SELECT id, user_id, content_locale
         FROM posts
         WHERE translation_group_id = ? AND format = ${PostFormat.Manuscript}
         LIMIT 50`,
        [requestedGroup],
      );
      if (!groupRows.length) {
        throw new DomainError(404, "Translation group not found");
      }
      if (groupRows.some((r) => r.user_id !== userId)) {
        throw new DomainError(
          403,
          "You can only add translations to your own manuscripts",
        );
      }
      if (groupRows.some((r) => r.content_locale === contentLocale)) {
        throw new DomainError(
          409,
          "A translation already exists for this language",
        );
      }
      translationGroupId = requestedGroup;
    } else {
      translationGroupId = generateId("tgrp");
    }
  }

  const uploads = await assertOwnedUploads(userId, args.attachmentIds ?? []);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO posts
         (id, user_id, body, format, title, visibility, category_id, font_family, text_color,
          shared_post_id, translation_group_id, content_locale, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        trimmed,
        format,
        format === PostFormat.Manuscript ? title : null,
        visibility,
        categoryId,
        fontFamily === "default" ? null : fontFamily,
        textColor === "default" ? null : textColor,
        args.sharedPostId ?? null,
        translationGroupId,
        contentLocale,
        isoToDB(now),
        isoToDB(now),
      ],
    );

    await insertAudienceRows(conn, id, audienceUserIds, now);

    for (const up of uploads) {
      await insertAttachment(conn, id, up, now);
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    const code = (err as { code?: string })?.code;
    const sqlMessage = (err as { sqlMessage?: string })?.sqlMessage ?? "";
    if (
      code === "ER_DUP_ENTRY" &&
      sqlMessage.includes("uq_posts_group_locale")
    ) {
      throw new DomainError(
        409,
        "A translation already exists for this language",
      );
    }
    throw err;
  } finally {
    conn.release();
  }

  const created = await getPostById(userId, id);
  if (!created) {
    throw new Error("Failed to load created post");
  }
  return created;
}
