import { CATEGORY_I18N_KEYS } from "~/types/post";

/**
 * Localized label for a post category. Seeded slugs resolve via i18n;
 * custom/admin names fall back to the stored `name`.
 */
export function categoryDisplayName(
  category: { slug: string; name: string },
  t: (key: string) => string,
  te?: (key: string) => boolean,
): string {
  const key = CATEGORY_I18N_KEYS[category.slug];
  if (!key) return category.name;
  if (te && !te(key)) return category.name;
  const translated = t(key);
  return translated && translated !== key ? translated : category.name;
}
