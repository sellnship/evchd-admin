import type { APIRoute } from 'astro';
export const prerender = false;
import { sql, logActivity } from '../../../../lib/db';

// Deleting a category never touches articles -- category is a plain text
// column (see schema.sql), so existing articles just keep showing the old
// name until someone re-picks a category on them.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const id = String(form.get('id') ?? '').trim();
  try {
    if (!id) throw new Error('missing id');
    await sql()`DELETE FROM categories WHERE id = ${Number(id)}`;
    await logActivity('category.delete', { id });
    return redirect('/admin/categories?deleted=1');
  } catch (e: any) {
    return redirect(`/admin/categories?err=${encodeURIComponent(e?.message ?? 'delete failed')}`);
  }
};
