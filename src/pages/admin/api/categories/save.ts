import type { APIRoute } from 'astro';
export const prerender = false;
import { sql, logActivity } from '../../../../lib/db';

// Create (id empty) or update (id present) a category. articles.category is
// plain text (see schema.sql), not a FK, so renaming here never touches
// existing articles -- same tradeoff as authors.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const existingId = String(form.get('id') ?? '').trim();
  const name = String(form.get('name') ?? '').trim();
  const description = String(form.get('description') ?? '').trim();
  const sort = Number(form.get('sort') ?? 100) || 100;

  const back = (qs: string) => redirect(`/admin/categories?${qs}`);

  try {
    if (!name) throw new Error('name is required');

    if (existingId) {
      await sql()`
        UPDATE categories SET name = ${name}, description = ${description}, sort = ${sort}
        WHERE id = ${Number(existingId)}`;
      await logActivity('category.update', { id: existingId });
    } else {
      await sql()`
        INSERT INTO categories (name, description, sort)
        VALUES (${name}, ${description}, ${sort})
        ON CONFLICT (name) DO UPDATE SET
          description = EXCLUDED.description, sort = EXCLUDED.sort`;
      await logActivity('category.create', { name });
    }
    return back('saved=1');
  } catch (e: any) {
    const msg = e?.message?.includes('categories_name_key')
      ? `a category named "${name}" already exists`
      : e?.message ?? 'save failed';
    return back(`err=${encodeURIComponent(msg)}`);
  }
};
