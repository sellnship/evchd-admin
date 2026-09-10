import type { APIRoute } from 'astro';
export const prerender = false;
import { factCheckArticle, buildGroundingContext } from '../../../../lib/blogPipeline';

// Re-runs just the fact-check stage against hand-edited content, without re-running the whole
// generate+review pipeline (see admin/blog/ai.astro's "Re-run Fact Check" button).
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const provider = typeof body.provider === 'string' ? body.provider : undefined;
  const contentMarkdown = String(body.contentMarkdown || '');
  if (!contentMarkdown) {
    return new Response(JSON.stringify({ error: 'Missing article content to fact-check.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    const grounding = await buildGroundingContext();
    const factCheck = await factCheckArticle(contentMarkdown, grounding, provider!);
    return new Response(JSON.stringify({ contentMarkdown: factCheck.revisedMarkdown, factCheck }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'Fact-check failed.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
