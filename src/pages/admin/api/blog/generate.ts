import type { APIRoute } from 'astro';
export const prerender = false;
import { checkDuplicate } from '../../../../lib/blogDedupe';
import { getProviderKey } from '../../../../lib/llm';
import { getCategories } from '../../../../lib/categories';
import {
  buildGroundingContext, listArticlesForDedupe, researchTopic, checkOriginality, draftArticle,
  ensureLengthFloor, wordCount, lengthFloor, humanizeWithQualityLoop,
  type ArticleLength, type Lang,
} from '../../../../lib/blogPipeline';

interface StepEvent {
  type: 'step';
  step: 'research' | 'dedupe' | 'originality' | 'draft' | 'humanize';
  status: 'running' | 'done' | 'error';
  detail: string;
}
interface ResultEvent {
  type: 'result';
  title: string;
  excerpt: string;
  contentMarkdown: string;
  category: string;
  tags: string[];
  keywords: string[];
  research: unknown;
  duplicateCheck: unknown;
  originality: unknown;
  aiPatternCheck: unknown;
}
interface ErrorEvent { type: 'error'; message: string }

// First half of the in-admin AI pipeline (research -> duplicate-check -> originality kill-switch
// -> draft -> humanize) -- replaces the GitHub Actions "Engine" (scripts/generate.mjs, dispatched
// via api/topics/dispatch.ts). Split from the review half (fact-check -> seo -> ai-search-opt ->
// editorial-review, see review.ts) so each serverless invocation stays comfortably under this
// project's 60s maxDuration (see astro.config.mjs) even though the full pipeline runs several LLM
// calls total -- the admin UI chains this call straight into /admin/api/blog/review.
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const provider = typeof body.provider === 'string' ? body.provider : undefined;
  const lang: Lang = body.lang === 'hi' ? 'hi' : 'en';
  const title = String(body.title || '').trim();
  const rationale = typeof body.rationale === 'string' ? body.rationale : undefined;
  const category = typeof body.category === 'string' ? body.category : undefined;
  const length: ArticleLength = ['short', 'medium', 'long'].includes(body.length) ? body.length : 'medium';
  const sourceNotes = typeof body.sourceNotes === 'string' ? body.sourceNotes : undefined;

  if (!title) {
    return new Response(JSON.stringify({ error: 'Missing a topic title to write about.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (provider && !(await getProviderKey(provider))) {
    return new Response(JSON.stringify({ error: `No API key configured for ${provider} -- add it in Settings.` }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: StepEvent | ResultEvent | ErrorEvent) => controller.enqueue(enc.encode(JSON.stringify(event) + '\n'));

      // Anchors the expansion-loop deadlines below -- this whole request runs inside one Vercel
      // serverless invocation bounded by a 60s maxDuration, and looping expansion is what can push
      // a request over that limit. Computed from actual elapsed time, not a fixed per-stage
      // duration, so a slow research/draft call correctly leaves less budget for expansion.
      const requestStartedAt = Date.now();
      try {
        const categories = await getCategories();

        send({ type: 'step', step: 'research', status: 'running', detail: 'Gathering verified local facts and existing articles…' });
        const [grounding, existingArticles] = await Promise.all([buildGroundingContext(), listArticlesForDedupe(lang)]);
        const research = await researchTopic({ title, rationale, category }, grounding, sourceNotes, provider!, requestStartedAt + 55_000);
        send({ type: 'step', step: 'research', status: 'done', detail: `${research.verifiedFacts.length} sourced fact(s), ${research.openQuestions.length} open question(s).` });

        send({ type: 'step', step: 'dedupe', status: 'running', detail: 'Checking against existing articles…' });
        const duplicateCheck = checkDuplicate(title, existingArticles);
        send({
          type: 'step', step: 'dedupe', status: duplicateCheck.verdict === 'DUPLICATE' ? 'error' : 'done',
          detail: duplicateCheck.verdict === 'DISTINCT'
            ? 'No close match found.'
            : `${duplicateCheck.verdict}: closest match "${duplicateCheck.matches[0]?.title}" (${Math.round((duplicateCheck.matches[0]?.similarity || 0) * 100)}% similar).`,
        });

        send({ type: 'step', step: 'draft', status: 'running', detail: 'Writing the full article…' });
        const draft = await draftArticle({ title, rationale, category }, lang, length, research, grounding, categories, provider!, requestStartedAt + 55_000, sourceNotes);

        // The originality kill-switch runs on the FIRST draft, before length-floor/humanize spend
        // more budget on an article that may get flagged anyway -- ported from the old engine's
        // critique.md gate. Advisory here (not a hard stop): the admin is watching this run
        // interactively, so the verdict is surfaced now and carried into the final editorial gate
        // in review.ts, rather than silently discarding the draft the way the old unattended
        // GitHub Actions run did.
        send({ type: 'step', step: 'originality', status: 'running', detail: 'Checking this isn\'t generic/commodity content…' });
        const originality = await checkOriginality(draft.contentMarkdown, provider!, requestStartedAt + 58_000);
        send({
          type: 'step', step: 'originality', status: originality.isCommodity ? 'error' : 'done',
          detail: originality.isCommodity ? `Flagged as commodity: ${originality.reason}` : 'Carries real local value.',
        });

        draft.contentMarkdown = await ensureLengthFloor(
          draft.title, draft.contentMarkdown, length, research, provider!,
          requestStartedAt + 30_000, // leaves the rest of the 60s budget for humanize + its own expansion below
          (words) => send({ type: 'step', step: 'draft', status: 'running', detail: `${words} words drafted -- below the ${length} target, expanding…` }),
        );
        const draftWords = wordCount(draft.contentMarkdown);
        send({ type: 'step', step: 'draft', status: 'done', detail: `${draftWords} words drafted.` });

        send({ type: 'step', step: 'humanize', status: 'running', detail: 'Revising for natural rhythm…' });
        const humanized = await humanizeWithQualityLoop(draft.title, draft.contentMarkdown, provider!, requestStartedAt + 45_000);
        let finalMarkdown = humanized.contentMarkdown;

        // humanizeWithQualityLoop legitimately cuts hedge-heavy/filler padding for concision, which
        // can undo the draft stage's own length-floor fix above -- same bounded, single-pass
        // expansion applied again so the length constraint survives the stage that can violate it last.
        finalMarkdown = await ensureLengthFloor(
          draft.title, finalMarkdown, length, research, provider!,
          requestStartedAt + 50_000, // 10s safety margin before Vercel's 60s hard cutoff
          (words) => send({ type: 'step', step: 'humanize', status: 'running', detail: `Humanized draft is ${words} words -- below the ${length} target, expanding…` }),
        );
        const humanizedWords = wordCount(finalMarkdown);

        send({
          type: 'step', step: 'humanize', status: 'done',
          detail: `${humanized.qualityNote || 'Revised for natural rhythm.'}${humanized.passes > 1 ? ` (needed ${humanized.passes} passes)` : ''} ` +
            `AI-pattern score: ${humanized.aiPatternCheck.score}/100. ${humanizedWords} words` +
            `${humanizedWords < lengthFloor(length) ? ` -- still below the ${length} target after expansion, review before publishing.` : '.'}`,
        });

        send({
          type: 'result',
          title: draft.title,
          excerpt: draft.excerpt,
          contentMarkdown: finalMarkdown,
          category: draft.category,
          tags: draft.tags,
          keywords: draft.keywords,
          research,
          duplicateCheck,
          originality,
          aiPatternCheck: humanized.aiPatternCheck,
        });
      } catch (err) {
        console.error('AI blog generate failed:', err);
        send({ type: 'error', message: err instanceof Error ? err.message : 'Generation failed.' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' } });
};
