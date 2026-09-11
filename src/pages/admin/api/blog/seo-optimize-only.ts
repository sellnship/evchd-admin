import type { APIRoute } from 'astro';
export const prerender = false;
import { scoreSeo } from '../../../../lib/seoScorer';
import { seoOptimize, buildInternalLinkCandidates, buildStaticPageCandidates, applyInternalLinks, type Lang } from '../../../../lib/blogPipeline';

// Re-runs just the SEO-optimize stage against hand-edited content (see admin/blog/ai.astro's
// "Re-run SEO Optimize" button).
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const provider = typeof body.provider === 'string' ? body.provider : undefined;
  const lang: Lang = body.lang === 'hi' ? 'hi' : 'en';
  const title = String(body.title || '').trim();
  const contentMarkdown = String(body.contentMarkdown || '');
  const category = String(body.category || '').trim();
  const slug = typeof body.slug === 'string' ? body.slug : undefined;
  const focusKeyword = typeof body.focusKeyword === 'string' ? body.focusKeyword : undefined;
  if (!contentMarkdown) {
    return new Response(JSON.stringify({ error: 'Missing article content to optimize.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    const [articleCandidates, staticCandidates] = await Promise.all([
      buildInternalLinkCandidates(lang, slug),
      buildStaticPageCandidates(lang).catch(() => []),
    ]);
    const linkCandidates = [...articleCandidates, ...staticCandidates];
    const seoReport = await seoOptimize(title, contentMarkdown, focusKeyword, linkCandidates, provider!);
    const linkResult = applyInternalLinks(contentMarkdown, seoReport.internalLinkSuggestions);
    const seoScore = scoreSeo({
      title, seoTitle: seoReport.seoTitle, seoDescription: seoReport.seoDescription, contentMarkdown: linkResult.markdown,
      keywords: seoReport.keywords, focusKeyword,
      internalLinkCount: (linkResult.markdown.match(/\]\(https?:\/\//g) || []).length + (linkResult.markdown.match(/\]\(\//g) || []).length,
    });
    return new Response(JSON.stringify({
      contentMarkdown: linkResult.markdown,
      seoTitle: seoReport.seoTitle,
      seoDescription: seoReport.seoDescription,
      keywords: seoReport.keywords,
      seoReport,
      seoScore,
      internalLinksInserted: linkResult.inserted,
      internalLinksSkipped: linkResult.skipped,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'SEO optimize failed.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
