import type { APIRoute } from 'astro';
export const prerender = false;
import { sql, logActivity } from '../../../../lib/db';
import { slugifyAuthorId } from '../../../../lib/authors';

// Create (id empty → derive from name) or update (id present, immutable) an
// author. Plain multipart-form/redirect, matching api/blog/save.ts's pattern
// -- author edits are simple, instant DB writes with no slow step to show
// progress for.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const existingId = String(form.get('id') ?? '').trim();
  const name = String(form.get('name') ?? '').trim();
  const role = String(form.get('role') ?? '').trim();
  const bio = String(form.get('bio') ?? '').trim();
  const photo = String(form.get('photo') ?? '').trim();
  const sort = Number(form.get('sort') ?? 100) || 100;

  const back = (qs: string) => redirect(`/admin/authors?${qs}`);

  try {
    if (!name) throw new Error('name is required');

    if (existingId) {
      await sql()`
        UPDATE authors SET name = ${name}, role = ${role}, bio = ${bio}, photo = ${photo}, sort = ${sort}
        WHERE id = ${existingId}`;
      await logActivity('author.update', { id: existingId });
    } else {
      const id = slugifyAuthorId(name);
      if (!id) throw new Error('could not derive an id from that name');
      await sql()`
        INSERT INTO authors (id, name, role, bio, photo, sort)
        VALUES (${id}, ${name}, ${role}, ${bio}, ${photo}, ${sort})
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name, role = EXCLUDED.role, bio = EXCLUDED.bio,
          photo = EXCLUDED.photo, sort = EXCLUDED.sort`;
      await logActivity('author.create', { id });
    }
    return back('saved=1');
  } catch (e: any) {
    return back(`err=${encodeURIComponent(e?.message ?? 'save failed')}`);
  }
};
