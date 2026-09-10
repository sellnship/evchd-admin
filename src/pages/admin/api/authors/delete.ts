import type { APIRoute } from 'astro';
export const prerender = false;
import { sql, logActivity } from '../../../../lib/db';

// Deleting an author never touches articles -- author/reviewed_by are plain
// text columns (see schema.sql), so existing bylines just keep showing the
// old name/id until someone re-picks an author on that article.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const id = String(form.get('id') ?? '').trim();
  try {
    if (!id) throw new Error('missing id');
    await sql()`DELETE FROM authors WHERE id = ${id}`;
    await logActivity('author.delete', { id });
    return redirect('/admin/authors?deleted=1');
  } catch (e: any) {
    return redirect(`/admin/authors?err=${encodeURIComponent(e?.message ?? 'delete failed')}`);
  }
};
