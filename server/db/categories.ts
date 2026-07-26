import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "./pool";
import type { PostCategory } from "../../types/post";

interface CategoryRow extends RowDataPacket {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
}

function rowToCategory(row: CategoryRow): PostCategory {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    sortOrder: Number(row.sort_order),
  };
}

export async function listPostCategories(): Promise<PostCategory[]> {
  const pool = getPool();
  const [rows] = await pool.query<CategoryRow[]>(
    `SELECT id, slug, name, sort_order
     FROM post_categories
     ORDER BY sort_order ASC, name ASC`
  );
  return rows.map(rowToCategory);
}

export async function getCategoryById(
  id: string
): Promise<PostCategory | null> {
  const pool = getPool();
  const [rows] = await pool.query<CategoryRow[]>(
    `SELECT id, slug, name, sort_order
     FROM post_categories
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  return rows[0] ? rowToCategory(rows[0]) : null;
}
