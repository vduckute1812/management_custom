import { DomainError } from "~/server/utils/http";
import type { ResultSetHeader } from "mysql2/promise";
import { isAppLocale, type AppLocale } from "../../../types/locale";
import { isMoneyCurrency, type MoneyCurrency } from "../../../types/money";
import { UploadKind } from "../../../types/post";
import { isoToDB } from "../datetime";
import { nowISO } from "../ids";
import { rowToUser, type UserRow } from "../mappers";
import { getPool } from "../pool";
import type { UserRecord } from "../types";
import { getUserById } from "./queries";

export interface UpdateUserProfileInput {
  /** Pass `undefined` to leave unchanged. Empty/null is rejected (name required). */
  name?: string | null;
  /** Upload id owned by the user; empty/null clears the avatar. */
  avatarUploadId?: string | null;
  title?: string | null;
  job?: string | null;
  location?: string | null;
}

function normalizeOptionalText(
  value: string | null | undefined,
  max: number,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    throw new DomainError(400, `Value must be ${max} characters or fewer`);
  }
  return trimmed;
}

/**
 * Partial profile update for the account owner. Returns the previous
 * `avatar_upload_id` when the avatar changes so callers can orphan-purge it.
 */
export async function updateUserProfile(
  id: string,
  input: UpdateUserProfileInput,
): Promise<{ user: UserRecord; previousAvatarUploadId: string | null }> {
  const pool = getPool();
  const [existingRows] = await pool.query<UserRow[]>(
    "SELECT * FROM users WHERE id = ? LIMIT 1",
    [id],
  );
  const existing = existingRows[0];
  if (!existing) {
    throw new DomainError(404, "User not found");
  }
  const previousAvatarUploadId = existing.avatar_upload_id ?? null;

  let name: string | undefined = undefined;
  if (input.name !== undefined) {
    const normalized = normalizeOptionalText(input.name, 120);
    if (normalized === null || normalized === undefined) {
      throw new DomainError(400, "Name is required");
    }
    name = normalized;
  }
  const title = normalizeOptionalText(input.title, 120);
  const job = normalizeOptionalText(input.job, 120);
  const location = normalizeOptionalText(input.location, 120);

  let avatarUploadId: string | null | undefined = undefined;
  if (input.avatarUploadId !== undefined) {
    if (input.avatarUploadId === null || !String(input.avatarUploadId).trim()) {
      avatarUploadId = null;
    } else {
      avatarUploadId = String(input.avatarUploadId).trim();
      const { getUploadById } = await import("../uploads");
      const upload = await getUploadById(avatarUploadId);
      if (!upload || upload.user_id !== id) {
        throw new DomainError(400, "Avatar upload is invalid");
      }
      if (upload.kind !== UploadKind.Image) {
        throw new DomainError(400, "Avatar must be an image");
      }
    }
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  if (name !== undefined) {
    sets.push("name = ?");
    params.push(name);
  }
  if (avatarUploadId !== undefined) {
    sets.push("avatar_upload_id = ?");
    params.push(avatarUploadId);
  }
  if (title !== undefined) {
    sets.push("title = ?");
    params.push(title);
  }
  if (job !== undefined) {
    sets.push("job = ?");
    params.push(job);
  }
  if (location !== undefined) {
    sets.push("location = ?");
    params.push(location);
  }

  if (!sets.length) {
    return {
      user: rowToUser(existing),
      previousAvatarUploadId: null,
    };
  }

  sets.push("updated_at = ?");
  params.push(isoToDB(nowISO()));
  params.push(id);

  await pool.query(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, params);

  const updated = await getUserById(id);
  if (!updated) {
    throw new Error("updateUserProfile: row vanished after update");
  }

  const avatarChanged =
    avatarUploadId !== undefined && avatarUploadId !== previousAvatarUploadId;

  return {
    user: updated,
    previousAvatarUploadId: avatarChanged ? previousAvatarUploadId : null,
  };
}

export interface UpdateUserPreferencesInput {
  locale?: AppLocale;
  moneyCurrency?: MoneyCurrency;
}

/**
 * Partial preference update (language + Money currency). Changing locale
 * does not rewrite currency — callers must pass moneyCurrency explicitly.
 */
export async function updateUserPreferences(
  id: string,
  input: UpdateUserPreferencesInput,
): Promise<UserRecord> {
  const pool = getPool();
  const sets: string[] = [];
  const params: unknown[] = [];

  if (input.locale !== undefined) {
    if (!isAppLocale(input.locale)) {
      throw new DomainError(400, "Unsupported locale");
    }
    sets.push("locale = ?");
    params.push(input.locale);
  }
  if (input.moneyCurrency !== undefined) {
    if (!isMoneyCurrency(input.moneyCurrency)) {
      throw new DomainError(400, "Unsupported currency");
    }
    sets.push("money_currency = ?");
    params.push(input.moneyCurrency);
  }

  if (!sets.length) {
    const existing = await getUserById(id);
    if (!existing) throw new DomainError(404, "User not found");
    return existing;
  }

  sets.push("updated_at = ?");
  params.push(isoToDB(nowISO()));
  params.push(id);

  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE users SET ${sets.join(", ")} WHERE id = ?`,
    params,
  );
  if (result.affectedRows === 0) {
    throw new DomainError(404, "User not found");
  }

  const updated = await getUserById(id);
  if (!updated) {
    throw new Error("updateUserPreferences: row vanished after update");
  }
  return updated;
}
