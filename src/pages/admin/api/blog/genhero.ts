import type { APIRoute } from 'astro';
export const prerender = false;
import { put } from '@vercel/blob';
import { sql, logActivity } from '../../../../lib/db';
import { generateImage, IMAGE_MODELS } from '../../../../lib/llm';
import { composeHero } from '../../../../lib/hero';

// Generate a hero image with the selected fal.ai model, brand it (1200×675
// WebP + logo), upload to Vercel Blob, and save it on the article. Returns
// JSON — the editor page calls this via fetch so it can show a live progress
// bar instead of a blocking full-page POST.
export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const id = String(form.get('id') ?? '');
  const modelId = String(form.get('image_model') ?? '');
  const quality = String(form.get('image_quality') ?? '');
  const scene = String(form.get('image_prompt') ?? '').trim();

  try {
    if (!id) throw new Error('save the article once before generating a hero');
    if (!IMAGE_MODELS.some((m) => m.id === modelId)) throw new Error('unknown image model');
    if (!scene) throw new Error('describe the image scene first');

    const rows = (await sql()`SELECT slug, lang FROM articles WHERE id = ${Number(id)}`) as
      { slug: string; lang: string }[];
    if (!rows.length) throw new Error('article not found');
    const { slug, lang } = rows[0];

    // Same editorial guardrails as the engine: seated step-through e-moped,
    // no kick scooters, no brand marks. (See scripts/lib/image.mjs.)
    const prompt =
      `The vehicle in the image (if any vehicle appears) is a seated step-through Indian electric scooter ` +
      `(low-speed e-moped) with a saddle/seat, flat floorboard and step-through frame — NOT a standing ` +
      `kick scooter, NOT a Segway/Xiaomi-style stand-on scooter. Scene: ${scene}. ` +
      `Quiet Chandigarh / Mohali modernist-concrete context, warm natural light, muted tones with a subtle ` +
      `electric-blue accent, realistic editorial photograph. No text, no logos, no watermark. ` +
      `Absolutely avoid: kick scooter, standing scooter, stand-on scooter, Segway, slim deck, ` +
      `person standing on scooter, scooter with no seat.`;

    const base = await generateImage(modelId, prompt, quality);
    const webp = await composeHero(base);

    const heroSlug = lang === 'hi' ? `${slug}-hi` : slug;
    const blob = await put(`blog/${heroSlug}-hero.webp`, webp, {
      access: 'public',
      contentType: 'image/webp',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    await sql()`UPDATE articles SET hero_image = ${blob.url}, updated_at = now() WHERE id = ${Number(id)}`;
    await logActivity('hero.generate', { slug, lang, model: modelId });
    return new Response(JSON.stringify({ url: blob.url }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'hero generation failed' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
