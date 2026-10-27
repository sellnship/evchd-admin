import type { APIRoute } from 'astro';
export const prerender = false;
import { randomBytes } from 'node:crypto';
import { sql, logActivity } from '../../../../lib/db';

// Generates (or reuses) a shareable preview token for an article, so an
// editor can hand a non-admin reviewer a link without giving them a login.
// The token is the entire access control (unguessable, long) -- see
// middleware.ts's isOpenPreview for the public-route exemption.
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const id = Number(body.id);
  const revoke = Boolean(body.revoke);
  if (!id) return new Response(JSON.stringify({ error: 'missing article id' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  try {
    if (revoke) {
      const rows = (await sql()`
        UPDATE articles SET preview_token = NULL WHERE id = ${id} RETURNING slug, lang`) as { slug: string; lang: string }[];
      if (!rows.length) throw new Error('article not found');
      await logActivity('preview_link.revoke', { slug: rows[0].slug, lang: rows[0].lang });
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    const existing = (await sql()`SELECT preview_token, slug, lang FROM articles WHERE id = ${id}`) as
      { preview_token: string | null; slug: string; lang: string }[];
    if (!existing.length) throw new Error('article not found');

    let token = existing[0].preview_token;
    if (!token) {
      token = randomBytes(24).toString('base64url');
      await sql()`UPDATE articles SET preview_token = ${token} WHERE id = ${id}`;
      await logActivity('preview_link.create', { slug: existing[0].slug, lang: existing[0].lang });
    }

    return new Response(JSON.stringify({ ok: true, token }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'could not create preview link' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
