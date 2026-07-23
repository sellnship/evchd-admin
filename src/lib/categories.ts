import { sql } from './db';

/** Niche categories from the DB (seeded by scripts/db/schema.sql). */
export async function getCategories(): Promise<string[]> {
  const rows = (await sql()`SELECT name FROM categories ORDER BY sort, name`) as { name: string }[];
  return rows.map((r) => r.name);
}
