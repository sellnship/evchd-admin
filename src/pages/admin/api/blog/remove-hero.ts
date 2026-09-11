import type { APIRoute } from 'astro';
export const prerender = false;
import { sql, logActivity } from '../../../../lib/db';

// Clears the hero image (and its alt text) so the article goes back to "No
// hero yet." -- doesn't touch the Blob file itself (harmless orphan, same
// tradeoff genhero.ts already makes on overwrite: simplicity over cleanup).
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const id = Number(body.id);
  if (!id) return new Response(JSON.stringify({ error: 'missing article id' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  try {
    const rows = (await sql()`
      UPDATE articles SET hero_image = '', image_alt = '', updated_at = now()
      WHERE id = ${id} RETURNING slug, lang`) as { slug: string; lang: string }[];
    if (!rows.length) throw new Error('article not found');
    await logActivity('hero.remove', { slug: rows[0].slug, lang: rows[0].lang });
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'remove failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
