import type { z } from "zod";
import {
  archiveMoneyUserCategory,
  getMoneyUserCategoryById,
  listMoneyUserCategories,
  upsertMoneyUserCategory,
} from "~/server/db/money/moneyUserCategories";
import { DomainError } from "~/server/utils/http";
import type { moneyUserCategoryUpsertBodySchema } from "~/server/schemas";
import type { MoneyUserCategory } from "~/types/money";

type UpsertBody = z.infer<typeof moneyUserCategoryUpsertBodySchema>;

export async function listMoneyUserCategoriesForUser(
  userId: string,
): Promise<{ categories: MoneyUserCategory[] }> {
  const categories = await listMoneyUserCategories(userId);
  return { categories };
}

export async function upsertMoneyUserCategoryForUser(
  userId: string,
  body: UpsertBody,
): Promise<{ category: MoneyUserCategory; created: boolean }> {
  return upsertMoneyUserCategory(userId, {
    id: body.id,
    name: body.name,
    emoji: body.emoji,
    color: body.color,
    direction: body.direction,
  });
}

export async function archiveMoneyUserCategoryForUser(
  userId: string,
  id: string,
): Promise<void> {
  const existing = await getMoneyUserCategoryById(userId, id);
  if (!existing || existing.archivedAt) {
    throw new DomainError(404, "Category not found");
  }
  await archiveMoneyUserCategory(userId, id);
}
