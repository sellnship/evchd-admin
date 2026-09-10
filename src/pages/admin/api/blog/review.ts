import type { APIRoute } from 'astro';
export const prerender = false;
import { checkDuplicate } from '../../../../lib/blogDedupe';
import { checkAiPatterns } from '../../../../lib/aiPatternChecker';
import { checkSimilarity } from '../../../../lib/similarityChecker';
import { scoreSeo } from '../../../../lib/seoScorer';
import {
  factCheckArticle, seoOptimize, aiSearchOptimize, runEditorialReview, buildGroundingContext,
  buildInternalLinkCandidates, applyInternalLinks, listArticlesForDedupe, listArticlesForSimilarity,
  type ResearchPacket, type Lang,
} from '../../../../lib/blogPipeline';
import { applyDeterministicCleanup } from '../../../../lib/blogEditorialRules';

interface StepEvent {
  type: 'step';
  step: 'factcheck' | 'seo' | 'aisearch' | 'similarity' | 'dedupe' | 'editorial';
  status: 'running' | 'done' | 'error';
  detail: string;
}
interface ResultEvent {
  type: 'result';
  contentMarkdown: string;
  seoTitle: string;
  seoDescription: string;
  keywords: string[];
  factCheck: unknown;
  seoReport: unknown;
  seoScore: unknown;
  aiSearchReport: unknown;
  duplicateCheck: unknown;
  similarity: unknown;
  aiPatternCheck: unknown;
  editorialReview: unknown;
  internalLinksInserted: { anchorText: string; url: string }[];
  internalLinksSkipped: { anchorText: string; url: string }[];
}
interface ErrorEvent { type: 'error'; message: string }

// Second half of the pipeline (fact-check -> seo -> ai-search-opt -> similarity -> duplicate-
// check -> editorial-review). Takes the draft/humanize output of /admin/api/blog/generate as
// input. Image generation is NOT part of this run -- hero/body images stay their own manual,
// on-demand actions via the existing genhero.ts/genimage.ts endpoints.
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const provider = typeof body.provider === 'string' ? body.provider : undefined;
  const lang: Lang = body.lang === 'hi' ? 'hi' : 'en';
  const title = String(body.title || '').trim();
  const category = String(body.category || '').trim();
  const contentMarkdown = String(body.contentMarkdown || '');
  const research = (body.research || { summary: '', verifiedFacts: [], openQuestions: [], entities: [] }) as ResearchPacket;
  const focusKeyword = typeof body.focusKeyword === 'string' ? body.focusKeyword : undefined;
  const isCommodity = Boolean(body.isCommodity);

  if (!title || !contentMarkdown) {
    return new Response(JSON.stringify({ error: 'Missing the drafted article to review.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: StepEvent | ResultEvent | ErrorEvent) => controller.enqueue(enc.encode(JSON.stringify(event) + '\n'));
      const requestStartedAt = Date.now();

      try {
        send({ type: 'step', step: 'factcheck', status: 'running', detail: 'Auditing claims against verified local facts…' });
        const grounding = await buildGroundingContext();
        const factCheck = await factCheckArticle(contentMarkdown, grounding, provider!, requestStartedAt + 55_000);
        send({
          type: 'step', step: 'factcheck', status: factCheck.blockers.length ? 'error' : 'done',
          detail: `${factCheck.issues.length} issue(s) checked, ${factCheck.blockers.length} critical blocker(s).`,
        });
        let workingMarkdown = factCheck.revisedMarkdown;

        send({ type: 'step', step: 'seo', status: 'running', detail: 'Optimizing title, metadata, and internal links…' });
        const linkCandidates = await buildInternalLinkCandidates(lang);
        const seoReport = await seoOptimize(title, workingMarkdown, focusKeyword, linkCandidates, provider!, requestStartedAt + 55_000);
        send({ type: 'step', step: 'seo', status: 'done', detail: `Meta title: "${seoReport.seoTitle}" -- ${seoReport.internalLinkSuggestions.length} internal link candidate(s) found.` });

        send({ type: 'step', step: 'aisearch', status: 'running', detail: 'Checking answer-engine clarity…' });
        const aiSearchReport = await aiSearchOptimize(workingMarkdown, provider!, requestStartedAt + 55_000);
        workingMarkdown = aiSearchReport.contentMarkdown;
        send({ type: 'step', step: 'aisearch', status: 'done', detail: aiSearchReport.notes.length ? aiSearchReport.notes.join('; ') : 'Already clear -- no changes needed.' });

        // Place the SEO stage's link suggestions into the body after AI Search Optimize (the last
        // stage that rewrites prose), so they land in the final text and survive every check after.
        const linkResult = applyInternalLinks(workingMarkdown, seoReport.internalLinkSuggestions);
        workingMarkdown = linkResult.markdown;

        send({ type: 'step', step: 'similarity', status: 'running', detail: 'Screening for copied/overlapping text…' });
        const similarityArticles = await listArticlesForSimilarity(lang);
        const similarity = checkSimilarity(workingMarkdown, grounding, similarityArticles);
        send({
          type: 'step', step: 'similarity', status: similarity.status === 'FAIL' ? 'error' : 'done',
          detail: similarity.status === 'PASS' ? 'No material overlap found.' : `${similarity.status} -- see Pipeline Report.`,
        });

        send({ type: 'step', step: 'dedupe', status: 'running', detail: 'Re-checking the final title against existing articles…' });
        const existingArticles = await listArticlesForDedupe(lang);
        const duplicateCheck = checkDuplicate(title, existingArticles);
        send({
          type: 'step', step: 'dedupe', status: duplicateCheck.verdict === 'DUPLICATE' ? 'error' : 'done',
          detail: duplicateCheck.verdict === 'DISTINCT' ? 'No close match found.' : `${duplicateCheck.verdict} -- see Pipeline Report.`,
        });

        const { markdown: finalCleaned, conclusionStripped: conclusionHeadingStripped, bannedPunctuationStripped } = applyDeterministicCleanup(workingMarkdown);
        workingMarkdown = finalCleaned;
        const aiPatternCheck = checkAiPatterns(workingMarkdown);
        const seoScore = scoreSeo({
          title, seoTitle: seoReport.seoTitle, seoDescription: seoReport.seoDescription, contentMarkdown: workingMarkdown,
          keywords: seoReport.keywords, focusKeyword,
          internalLinkCount: (workingMarkdown.match(/\]\(https?:\/\//g) || []).length + (workingMarkdown.match(/\]\(\//g) || []).length,
        });

        send({ type: 'step', step: 'editorial', status: 'running', detail: 'Running the final editorial gate…' });
        const editorialReview = await runEditorialReview({
          title, contentMarkdown: workingMarkdown, seoTitle: seoReport.seoTitle, seoDescription: seoReport.seoDescription,
          category, factCheckBlockers: factCheck.blockers, duplicateVerdict: duplicateCheck.verdict,
          conclusionHeadingStripped, bannedPunctuationStripped, aiPatternScore: aiPatternCheck.score,
          similarityStatus: similarity.status, isCommodity,
        }, provider!, requestStartedAt + 58_000);
        send({
          type: 'step', step: 'editorial', status: editorialReview.verdict === 'PASS' ? 'done' : 'error',
          detail: editorialReview.verdict === 'PASS' ? 'Passed all checks.' : `${editorialReview.blockers.length} blocker(s) -- review before publishing.`,
        });

        send({
          type: 'result',
          contentMarkdown: workingMarkdown,
          seoTitle: seoReport.seoTitle,
          seoDescription: seoReport.seoDescription,
          keywords: seoReport.keywords,
          factCheck,
          seoReport,
          seoScore,
          aiSearchReport,
          duplicateCheck,
          similarity,
          aiPatternCheck,
          editorialReview,
          internalLinksInserted: linkResult.inserted,
          internalLinksSkipped: linkResult.skipped,
        });
      } catch (err) {
        console.error('AI blog review failed:', err);
        send({ type: 'error', message: err instanceof Error ? err.message : 'Review failed.' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' } });
};
