import type { APIRoute } from 'astro';
export const prerender = false;
import { del } from '@vercel/blob';
import { logActivity } from '../../../../lib/db';

// Deletes a blob from the Media Library. Does NOT check whether the URL is
// still referenced by an article's hero_image/body_md -- the admin is
// expected to check the "used in" hint shown in the library UI before
// deleting; a delete against a still-referenced image just leaves a broken
// <img> until that reference is edited out, same failure mode as deleting
// any other shared asset.
export const POST: APIRoute = async ({ request }) => {
  try {
    const { url } = await request.json();
    if (!url || typeof url !== 'string') throw new Error('missing url');
    await del(url);
    await logActivity('media.delete', { url });
    return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'delete failed' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
