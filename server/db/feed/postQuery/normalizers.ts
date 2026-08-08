import type { PostFontFamily, PostTextColor } from "../../../../types/post";
import { POST_FONT_FAMILIES, POST_TEXT_COLORS } from "../../../../types/post";
import { isContentLocale } from "../../../../utils/contentLocale";

export function normalizeFontFamily(
  value: string | null | undefined,
): PostFontFamily {
  if (value && (POST_FONT_FAMILIES as readonly string[]).includes(value)) {
    return value as PostFontFamily;
  }
  return "default";
}

export function normalizeTitle(
  value: string | null | undefined,
): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : null;
}

export function normalizeContentLocale(
  value: string | null | undefined,
): string {
  if (isContentLocale(value)) return value;
  return "und";
}

export function normalizeTextColor(
  value: string | null | undefined,
): PostTextColor {
  if (value && (POST_TEXT_COLORS as readonly string[]).includes(value)) {
    return value as PostTextColor;
  }
  return "default";
}
