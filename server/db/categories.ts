import type { RowDataPacket } from "mysql2/promise";
import { isoToDB } from "./datetime";
import { generateId, nowISO } from "./ids";
import { getPool } from "./pool";
import type { PostCategory } from "../../types/post";

interface CategoryRow extends RowDataPacket {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
  post_count?: number;
}

function rowToCategory(row: CategoryRow): PostCategory {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    sortOrder: Number(row.sort_order),
    postCount:
      row.post_count === undefined ? undefined : Number(row.post_count),
  };
}

/** Lists all directories with the total article count in each. */
export async function listPostCategories(): Promise<PostCategory[]> {
  const pool = getPool();
  const [rows] = await pool.query<CategoryRow[]>(
    `SELECT
       c.id, c.slug, c.name, c.sort_order,
       (SELECT COUNT(*) FROM posts p WHERE p.category_id = c.id) AS post_count
     FROM post_categories c
     ORDER BY c.sort_order ASC, c.name ASC`,
  );
  return rows.map(rowToCategory);
}

export async function getCategoryById(
  id: string,
): Promise<PostCategory | null> {
  const pool = getPool();
  const [rows] = await pool.query<CategoryRow[]>(
    `SELECT id, slug, name, sort_order
     FROM post_categories
     WHERE id = ?
     LIMIT 1`,
    [id],
  );
  return rows[0] ? rowToCategory(rows[0]) : null;
}

export async function getCategoryBySlug(
  slug: string,
): Promise<PostCategory | null> {
  const pool = getPool();
  const [rows] = await pool.query<CategoryRow[]>(
    `SELECT id, slug, name, sort_order
     FROM post_categories
     WHERE slug = ?
     LIMIT 1`,
    [slug],
  );
  return rows[0] ? rowToCategory(rows[0]) : null;
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export async function createPostCategory(args: {
  name: string;
  slug?: string | null;
  sortOrder?: number | null;
}): Promise<PostCategory> {
  const pool = getPool();
  const name = args.name.trim();
  const slug = slugify(args.slug?.trim() || name);
  if (!name || !slug) {
    throw Object.assign(new Error("Category name is required"), {
      statusCode: 400,
    });
  }
  const existing = await getCategoryBySlug(slug);
  if (existing) {
    throw Object.assign(new Error("A category with this slug already exists"), {
      statusCode: 409,
    });
  }

  let sortOrder = args.sortOrder;
  if (sortOrder === null || sortOrder === undefined) {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM post_categories",
    );
    sortOrder = Number(rows[0]?.next ?? 10);
  }

  const id = generateId("cat");
  await pool.query(
    `INSERT INTO post_categories (id, slug, name, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, slug, name, sortOrder, isoToDB(nowISO())],
  );
  return { id, slug, name, sortOrder, postCount: 0 };
}

export async function updatePostCategory(
  id: string,
  args: { name?: string; sortOrder?: number },
): Promise<PostCategory> {
  const pool = getPool();
  const existing = await getCategoryById(id);
  if (!existing) {
    throw Object.assign(new Error("Category not found"), { statusCode: 404 });
  }
  const name = args.name?.trim() || existing.name;
  const sortOrder = args.sortOrder ?? existing.sortOrder;
  await pool.query(
    "UPDATE post_categories SET name = ?, sort_order = ? WHERE id = ?",
    [name, sortOrder, id],
  );
  return { ...existing, name, sortOrder };
}

/** Deletes a directory; posts inside fall back to uncategorized (FK SET NULL). */
export async function deletePostCategory(id: string): Promise<boolean> {
  const pool = getPool();
  const [result] = await pool.query(
    "DELETE FROM post_categories WHERE id = ?",
    [id],
  );
  return ((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
}
