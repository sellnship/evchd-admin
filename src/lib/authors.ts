import { sql } from './db';

export interface Author {
  id: string;
  name: string;
  role: string;
  bio: string;
  photo: string;
  sort: number;
  created_at: string;
}

/** All authors (seeded by scripts/db/schema.sql), for byline/reviewer dropdowns. */
export async function getAuthors(): Promise<Author[]> {
  return (await sql()`SELECT * FROM authors ORDER BY sort, name`) as unknown as Author[];
}

export async function getAuthor(id: string): Promise<Author | null> {
  const rows = (await sql()`SELECT * FROM authors WHERE id = ${id}`) as unknown as Author[];
  return rows[0] ?? null;
}

export function slugifyAuthorId(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
