import type { APIRoute } from 'astro';
export const prerender = false;
import { suggestInternalLinksOnly, buildInternalLinkCandidates, applyInternalLinks, type Lang } from '../../../../lib/blogPipeline';

// Re-runs just internal-linking against the current (possibly hand-edited) content -- separate
// from the full SEO-optimize stage, since a fact-check/humanize pass can shift where a previous
// link suggestion's anchor text actually lands, and re-linking shouldn't require re-writing the
// SEO title/description/keywords too (see admin/blog/ai.astro's "Add Internal Links" button).
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const provider = typeof body.provider === 'string' ? body.provider : undefined;
  const lang: Lang = body.lang === 'hi' ? 'hi' : 'en';
  const contentMarkdown = String(body.contentMarkdown || '');
  if (!contentMarkdown) {
    return new Response(JSON.stringify({ error: 'Missing article content to link.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    const linkCandidates = await buildInternalLinkCandidates(lang);
    if (!linkCandidates.length) {
      return new Response(JSON.stringify({ contentMarkdown, internalLinksInserted: [], internalLinksSkipped: [], note: 'No other published articles yet to link to.' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const suggestions = await suggestInternalLinksOnly(contentMarkdown, linkCandidates, provider!);
    const linkResult = applyInternalLinks(contentMarkdown, suggestions);
    return new Response(JSON.stringify({
      contentMarkdown: linkResult.markdown,
      internalLinksInserted: linkResult.inserted,
      internalLinksSkipped: linkResult.skipped,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'Internal linking failed.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
