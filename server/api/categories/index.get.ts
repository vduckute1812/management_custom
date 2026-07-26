import { listPostCategories } from "~/server/utils/db";

export default defineEventHandler(async () => {
  const categories = await listPostCategories();
  return { categories };
});
