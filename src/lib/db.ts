// Neon access for the admin app (HTTP driver — one client per lambda is fine).
import { neon } from '@neondatabase/serverless';

let _sql: ReturnType<typeof neon> | null = null;

export function sql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    _sql = neon(url);
  }
  return _sql;
}

export interface Article {
  id: number;
  slug: string;
  lang: 'en' | 'hi';
  title: string;
  description: string;
  category: string;
  hero_image: string;
  author: string;
  reviewed_by: string;
  date_published: string | null;
  date_modified: string | null;
  tags: string[];
  body_md: string;
  status: 'draft' | 'published';
  source: 'ai' | 'manual';
  created_at: string;
  updated_at: string;
}

export interface Topic {
  id: number;
  slug: string;
  lang: 'en' | 'hi';
  title: string;
  category: string;
  image_prompt: string;
  angle: string;
  status: string;
  outcome: Record<string, unknown>;
  processed_at: string | null;
  created_at: string;
}

export async function logActivity(action: string, detail: Record<string, unknown> = {}, actor = 'admin') {
  await sql()`INSERT INTO activity_log (actor, action, detail)
              VALUES (${actor}, ${action}, ${JSON.stringify(detail)}::jsonb)`;
}
