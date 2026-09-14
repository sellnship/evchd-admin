import { sql } from './db';

export interface Category {
  id: number;
  name: string;
  description: string;
  sort: number;
  created_at: string;
}

/** Niche categories from the DB (seeded by scripts/db/schema.sql). */
export async function getCategories(): Promise<string[]> {
  const rows = (await sql()`SELECT name FROM categories ORDER BY sort, name`) as { name: string }[];
  return rows.map((r) => r.name);
}

/** Full category rows, for the admin CRUD page. */
export async function getCategoryRows(): Promise<Category[]> {
  return (await sql()`SELECT * FROM categories ORDER BY sort, name`) as unknown as Category[];
}

export async function getCategory(id: number): Promise<Category | null> {
  const rows = (await sql()`SELECT * FROM categories WHERE id = ${id}`) as unknown as Category[];
  return rows[0] ?? null;
}

/** How many articles currently use this category name (articles.category is plain text, not a FK). */
export async function countArticlesInCategory(name: string): Promise<number> {
  const rows = (await sql()`SELECT count(*)::int AS n FROM articles WHERE category = ${name}`) as { n: number }[];
  return rows[0]?.n ?? 0;
}
