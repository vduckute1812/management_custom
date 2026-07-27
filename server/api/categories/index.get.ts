import { listPostCategories } from "~/server/utils/db";
import {
  CacheKeys,
  CacheTTL,
  cacheGetOrSet,
} from "~/server/utils/cache";

export default defineEventHandler(async () => {
  const categories = await cacheGetOrSet(
    CacheKeys.categories(),
    CacheTTL.categories,
    () => listPostCategories(),
  );
  return { categories };
});
