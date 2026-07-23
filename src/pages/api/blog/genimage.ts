import type { APIRoute } from 'astro';
import { put } from '@vercel/blob';
import sharp from 'sharp';
import { sql, logActivity } from '../../../lib/db';
import { generateImage, IMAGE_MODELS } from '../../../lib/llm';

// Generate a BODY image (inside the article markdown): 16:9 WebP on Blob, no
// logo watermark (that's hero-only). Returns JSON { url } — the editor inserts
// the markdown at the cursor.
export const POST: APIRoute = async ({ request }) => {
  try {
    const { id, prompt, image_model } = await request.json();
    if (!id) throw new Error('save the article first');
    if (!IMAGE_MODELS.some((m) => m.id === image_model)) throw new Error('unknown image model');
    if (!prompt?.trim()) throw new Error('describe the image first');

    const rows = (await sql()`SELECT slug, lang FROM articles WHERE id = ${Number(id)}`) as
      { slug: string; lang: string }[];
    if (!rows.length) throw new Error('article not found');
    const { slug, lang } = rows[0];

    const fullPrompt =
      `If any two-wheeler appears: a seated step-through Indian electric scooter (low-speed e-moped) ` +
      `with saddle and floorboard — never a standing kick scooter. Scene: ${String(prompt).trim()}. ` +
      `Chandigarh/Mohali context, warm natural light, realistic editorial photograph. ` +
      `No text, no logos, no watermark.`;

    const base = await generateImage(image_model, fullPrompt);
    const webp = await sharp(base)
      .resize(1200, 675, { fit: 'cover', position: 'centre' })
      .webp({ quality: 82 })
      .toBuffer();

    const name = `blog/${lang === 'hi' ? `${slug}-hi` : slug}-body-${Date.now()}.webp`;
    const blob = await put(name, webp, { access: 'public', contentType: 'image/webp' });

    await logActivity('image.generate', { slug, lang, model: image_model });
    return new Response(JSON.stringify({ url: blob.url }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'image generation failed' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
