/**
 * Install-wide integer settings (TINYINT key + INT value).
 */

import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import {
  AppSettingKey,
  type AppSettingKey as AppSettingKeyValue,
} from "../../types/appSettings";
import { isoToDB } from "./datetime";
import { nowISO } from "./ids";
import { getPool } from "./pool";

interface SettingRow extends RowDataPacket {
  setting_key: number;
  value_int: number;
  updated_at: string;
}

export async function getAppSettingInt(
  key: AppSettingKeyValue,
  fallback: number,
): Promise<number> {
  const pool = getPool();
  const [rows] = await pool.query<SettingRow[]>(
    `SELECT setting_key, value_int, updated_at
     FROM app_settings WHERE setting_key = ? LIMIT 1`,
    [key],
  );
  const row = rows[0];
  if (!row) return fallback;
  return Number(row.value_int);
}

export async function setAppSettingInt(
  key: AppSettingKeyValue,
  value: number,
): Promise<number> {
  const pool = getPool();
  const now = nowISO();
  await pool.query<ResultSetHeader>(
    `INSERT INTO app_settings (setting_key, value_int, updated_at)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE value_int = VALUES(value_int), updated_at = VALUES(updated_at)`,
    [key, value, isoToDB(now)],
  );
  return value;
}

export async function isArticlesDailyFetchEnabled(): Promise<boolean> {
  // Env can force-disable regardless of DB toggle.
  const env = (process.env.ARTICLES_FETCH_ENABLED || "true")
    .trim()
    .toLowerCase();
  if (["0", "false", "no", "off"].includes(env)) return false;
  const value = await getAppSettingInt(
    AppSettingKey.ArticlesDailyFetchEnabled,
    1,
  );
  return value === 1;
}

export async function setArticlesDailyFetchEnabled(
  enabled: boolean,
): Promise<boolean> {
  await setAppSettingInt(
    AppSettingKey.ArticlesDailyFetchEnabled,
    enabled ? 1 : 0,
  );
  return enabled;
}

export { AppSettingKey };
