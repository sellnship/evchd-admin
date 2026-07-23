import type { APIRoute } from 'astro';
import { sql, logActivity } from '../../../lib/db';

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const slug = String(form.get('slug') ?? '').trim().toLowerCase();
  const titleEn = String(form.get('title_en') ?? '').trim();
  const titleHi = String(form.get('title_hi') ?? '').trim();
  const category = String(form.get('category') ?? '').trim();
  const angle = String(form.get('angle') ?? '').trim();
  const imagePrompt = String(form.get('image_prompt') ?? '').trim();

  try {
    if (!/^[a-z0-9-]+$/.test(slug)) throw new Error('slug must be lowercase letters/digits/hyphens');
    if (!titleEn || !titleHi) throw new Error('both titles are required');

    const q = sql();
    // EN + HI pair sharing the slug — exactly like queue.json entries.
    await q`
      INSERT INTO topics (slug, lang, title, category, image_prompt, angle)
      VALUES (${slug}, 'en', ${titleEn}, ${category}, ${imagePrompt}, ${angle}),
             (${slug}, 'hi', ${titleHi}, ${category}, ${imagePrompt}, ${angle})`;
    await logActivity('topic.create', { slug });
    return redirect(`/generator?ok=${encodeURIComponent(`Topic "${slug}" queued (EN + HI).`)}`);
  } catch (e: any) {
    const msg = /duplicate key|unique/i.test(String(e?.message))
      ? `topic "${slug}" already exists`
      : e?.message ?? 'unknown error';
    return redirect(`/generator?err=${encodeURIComponent(msg)}`);
  }
};
