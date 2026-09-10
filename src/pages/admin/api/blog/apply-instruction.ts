import type { APIRoute } from 'astro';
export const prerender = false;
import { applyCustomInstruction } from '../../../../lib/blogPipeline';

// Free-form, single-shot edit against the already-drafted article (append a paragraph, mention
// something specific, adjust a section) -- see admin/blog/ai.astro's "Custom instruction" field.
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const provider = typeof body.provider === 'string' ? body.provider : undefined;
  const title = String(body.title || '').trim();
  const contentMarkdown = String(body.contentMarkdown || '');
  const instruction = String(body.instruction || '').trim();
  if (!contentMarkdown || !instruction) {
    return new Response(JSON.stringify({ error: 'Missing the article content or the instruction to apply.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    const result = await applyCustomInstruction(title, contentMarkdown, instruction, provider!);
    return new Response(JSON.stringify({ contentMarkdown: result.contentMarkdown }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'Applying the instruction failed.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
