import type { APIRoute } from 'astro';
export const prerender = false;
import { humanizeWithQualityLoop } from '../../../../lib/blogPipeline';

// Re-runs just the humanize-with-quality-loop stage against hand-edited content (see
// admin/blog/ai.astro's "Re-run Humanize" button).
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const provider = typeof body.provider === 'string' ? body.provider : undefined;
  const title = String(body.title || '').trim();
  const contentMarkdown = String(body.contentMarkdown || '');
  if (!contentMarkdown) {
    return new Response(JSON.stringify({ error: 'Missing article content to humanize.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    const result = await humanizeWithQualityLoop(title, contentMarkdown, provider!);
    return new Response(JSON.stringify({
      contentMarkdown: result.contentMarkdown,
      aiPatternCheck: result.aiPatternCheck,
      passes: result.passes,
      qualityNote: result.qualityNote,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'Humanize failed.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
