import type { APIRoute } from 'astro';
export const prerender = false;
import { translateArticle, type Lang } from '../../../../lib/blogPipeline';

// Faithful translation from the EN/HI counterpart's finished article -- see
// admin/blog/[id].astro's "Translate from ..." button. Keeps the two language
// versions of a slug structurally/factually aligned instead of letting each
// language's independent draft drift apart.
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const provider = typeof body.provider === 'string' ? body.provider : undefined;
  const sourceTitle = String(body.sourceTitle || '').trim();
  const sourceMarkdown = String(body.sourceMarkdown || '');
  const targetLang: Lang = body.targetLang === 'hi' ? 'hi' : 'en';
  if (!sourceTitle || !sourceMarkdown) {
    return new Response(JSON.stringify({ error: 'Missing the source article to translate.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    const result = await translateArticle(sourceTitle, sourceMarkdown, targetLang, provider!);
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'Translation failed.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
