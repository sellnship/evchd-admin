import type { APIRoute } from 'astro';
export const prerender = false;
import { sql, logActivity } from '../../../../lib/db';

// Deletes a single article row. Doesn't touch its hero/in-body Blob images or
// any queued topics row for the same slug -- same orphan-is-fine tradeoff
// remove-hero.ts already makes, simplicity over cleanup.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const id = Number(form.get('id'));
  const back = String(form.get('back') ?? '/admin/blog');

  if (!id) return redirect(`${back}${back.includes('?') ? '&' : '?'}err=${encodeURIComponent('missing article id')}`);

  try {
    const rows = (await sql()`DELETE FROM articles WHERE id = ${id} RETURNING slug, lang`) as { slug: string; lang: string }[];
    if (!rows.length) throw new Error('article not found');
    await logActivity('article.delete', { slug: rows[0].slug, lang: rows[0].lang });
    return redirect(back);
  } catch (e: any) {
    return redirect(`${back}${back.includes('?') ? '&' : '?'}err=${encodeURIComponent(e?.message ?? 'delete failed')}`);
  }
};
