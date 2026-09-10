// Neon access for the admin app (HTTP driver — one client per lambda is fine).
import { neon } from '@neondatabase/serverless';
import { env } from './env';

let _sql: ReturnType<typeof neon> | null = null;

export function sql() {
  if (!_sql) {
    const url = env('DATABASE_URL');
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
  // Pipeline audit trail (nullable — populated only by the in-admin AI pipeline, see
  // lib/blogPipeline.ts; a manual edit or pre-pipeline article leaves these null).
  research_json?: unknown;
  duplicate_check_json?: unknown;
  fact_check_json?: unknown;
  seo_report_json?: unknown;
  ai_search_report_json?: unknown;
  editorial_review_json?: { verdict: 'PASS' | 'FAIL'; blockers: string[] } | null;
  ai_pattern_check_json?: { score: number; flags: string[] } | null;
  similarity_json?: unknown;
  internal_links_json?: unknown;
  estimated_cost_usd?: number | null;
  image_prompt?: string | null;
  image_alt?: string | null;
  image_caption?: string | null;
  image_status?: string | null;
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
