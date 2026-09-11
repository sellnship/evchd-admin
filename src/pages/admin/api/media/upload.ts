import type { APIRoute } from 'astro';
export const prerender = false;
import { put } from '@vercel/blob';
import { logActivity } from '../../../../lib/db';

// Plain upload to the Media Library -- no forced crop/size, unlike the
// hero/body flows which are tied to a specific layout slot. Stored under
// blog/uploads/ so it doesn't collide with the hero/body naming convention
// (blog/<slug>-hero.webp, blog/<slug>-body-<ts>.webp).
export const POST: APIRoute = async ({ request }) => {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) throw new Error('choose a file first');
    if (!file.type.startsWith('image/')) throw new Error('only image files are supported');

    const buf = Buffer.from(await file.arrayBuffer());
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '-');
    const blob = await put(`blog/uploads/${Date.now()}-${safeName}`, buf, {
      access: 'public',
      contentType: file.type,
    });

    await logActivity('media.upload', { pathname: blob.pathname });
    return new Response(JSON.stringify({ url: blob.url, pathname: blob.pathname }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'upload failed' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
