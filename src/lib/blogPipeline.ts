// Server-only. The in-admin AI blog pipeline — replaces the GitHub Actions "Engine"
// (scripts/generate.mjs, dispatched via api/topics/dispatch.ts) entirely: research ->
// originality kill-switch -> draft -> length-floor -> humanize-with-quality-loop (generate.ts),
// then fact-check -> seo-optimize -> ai-search-optimize -> similarity-check -> dedupe-recheck ->
// editorial-review (review.ts). Ported from gmadanew-inspect's blogAi.ts (a live production
// pipeline at gmada.in) and rewired onto this project's own multi-provider `completeJSON()`
// (lib/llm.ts) instead of duplicating a second per-provider fetch layer, and onto this site's own
// grounding data (local-facts.json/models.json in the main site repo) instead of gmada's live
// notices/tenders. Every stage composes its system prompt from blogEditorialRules.ts so the site
// identity / hard prohibitions / content rules stay consistent across every call.
import { completeJSON } from './llm';
import { getFile } from './github';
import { sql } from './db';
import {
  editorialSystemPreamble,
  HUMANIZER_PHRASE_LIST,
  applyDeterministicCleanup,
} from './blogEditorialRules';
import { scanForbiddenLanguage } from './forbiddenLanguage';
import { checkAiPatterns, type AiPatternResult } from './aiPatternChecker';

export type ArticleLength = 'short' | 'medium' | 'long';
export type Lang = 'en' | 'hi';

const LENGTH_TARGETS: Record<ArticleLength, { min: number; max: number }> = {
  short: { min: 500, max: 700 },
  medium: { min: 900, max: 1300 },
  long: { min: 1600, max: 2200 },
};
const LENGTH_SPEC: Record<ArticleLength, string> = {
  short: `${LENGTH_TARGETS.short.min}-${LENGTH_TARGETS.short.max} words`,
  medium: `${LENGTH_TARGETS.medium.min}-${LENGTH_TARGETS.medium.max} words`,
  long: `${LENGTH_TARGETS.long.min}-${LENGTH_TARGETS.long.max} words`,
};

function langRules(lang: Lang): string {
  return lang === 'hi'
    ? 'Write NATIVELY in simple, conversational Hindi (Devanagari) -- the everyday Hindi of ' +
      'Chandigarh/Mohali, keeping common English terms (scooter, battery, charging, RTO) in Latin ' +
      'script as people actually speak. Do NOT translate word-by-word from English.'
    : 'Write in plain, direct English -- grade-8 reading level, no jargon.';
}

// ---------------------------------------------------------------------------------------------
// Grounding: local-facts.json / models.json, fetched read-only from the main site repo (the same
// source of truth the old GitHub Actions engine read directly off disk). This is the only GitHub
// API usage in the whole pipeline, and it's a read, not a write -- no article content is created
// or committed via GitHub.
// ---------------------------------------------------------------------------------------------

let groundingCache: { text: string; fetchedAt: number } | null = null;
const GROUNDING_CACHE_MS = 5 * 60 * 1000; // facts/models change rarely; avoid a GitHub call per stage

export async function buildGroundingContext(): Promise<string> {
  if (groundingCache && Date.now() - groundingCache.fetchedAt < GROUNDING_CACHE_MS) {
    return groundingCache.text;
  }
  const [factsFile, modelsFile, existing] = await Promise.all([
    getFile('src/data/local-facts.json').catch(() => null),
    getFile('src/data/models.json').catch(() => null),
    listArticleTitlesForGrounding().catch(() => []),
  ]);
  const text = [
    'VERIFIED LOCAL FACTS (local-facts.json -- the only facts you may state):',
    factsFile?.content ?? '(unavailable -- GITHUB_TOKEN/GITHUB_REPO may not be configured)',
    '',
    'MODELS -- low-speed class only (models.json):',
    modelsFile?.content ?? '(unavailable)',
    '',
    'ARTICLES ALREADY PUBLISHED (do not repropose these same topics):',
    existing.length ? existing.map((t) => `- ${t}`).join('\n') : '(none yet)',
  ].join('\n');
  groundingCache = { text, fetchedAt: Date.now() };
  return text;
}

async function listArticleTitlesForGrounding(): Promise<string[]> {
  const rows = (await sql()`SELECT DISTINCT title FROM articles ORDER BY title LIMIT 60`) as { title: string }[];
  return rows.map((r) => r.title);
}

export interface InternalLinkCandidate {
  title: string;
  url: string;
}

/** Real internal-link candidates for seoOptimize()'s suggestions -- this site's own published
 * articles. (gmada.in also links to category-specific static pages; evchd's guides/news/compare
 * static content isn't wired in here yet -- articles-only candidates for now, extend this list
 * once specific evergreen guide URLs are worth curating.) */
export async function buildInternalLinkCandidates(lang: Lang): Promise<InternalLinkCandidate[]> {
  const rows = (await sql()`
    SELECT slug, title FROM articles WHERE status = 'published' AND lang = ${lang}
    ORDER BY date_published DESC LIMIT 20`) as { slug: string; title: string }[];
  const prefix = lang === 'hi' ? '/hi/blog' : '/blog';
  return rows.map((r) => ({ title: r.title, url: `${prefix}/${r.slug}` }));
}

/** Candidates for blogDedupe.ts's checkDuplicate() -- same language only (an EN/HI translation
 * pair intentionally shares a title's meaning, not a title match against the other language). */
export async function listArticlesForDedupe(lang: Lang): Promise<{ id: string; title: string; slug: string }[]> {
  const rows = (await sql()`SELECT id, title, slug FROM articles WHERE lang = ${lang}`) as { id: number; title: string; slug: string }[];
  return rows.map((r) => ({ id: String(r.id), title: r.title, slug: r.slug }));
}

/** Candidates for similarityChecker.ts's checkSimilarity() -- needs body content, not just
 * titles, and is capped since it's an O(n) shingle-overlap scan against every candidate. */
export async function listArticlesForSimilarity(lang: Lang, limit = 60): Promise<{ id: string; title: string; contentMarkdown: string }[]> {
  const rows = (await sql()`
    SELECT id, title, body_md FROM articles WHERE lang = ${lang}
    ORDER BY updated_at DESC LIMIT ${limit}`) as { id: number; title: string; body_md: string }[];
  return rows.map((r) => ({ id: String(r.id), title: r.title, contentMarkdown: r.body_md }));
}

// ---------------------------------------------------------------------------------------------
// Stage: Research
// ---------------------------------------------------------------------------------------------

export interface ResearchFact {
  claim: string;
  source: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ResearchPacket {
  summary: string;
  verifiedFacts: ResearchFact[];
  openQuestions: string[];
  entities: string[];
}

export async function researchTopic(
  topic: { title: string; rationale?: string; category?: string },
  grounding: string,
  sourceNotes: string | undefined,
  provider: string,
  deadline?: number,
): Promise<ResearchPacket> {
  const system =
    `${editorialSystemPreamble()}\n\nBuild a source-backed research packet for the topic below. Use ONLY ` +
    'the verified local facts / models data and admin-supplied source notes provided in the user message -- ' +
    'do not invent facts, tariffs, prices, dates, or specs not present there or general public knowledge. If ' +
    'the grounding data is too thin to support a solid article, say so in openQuestions rather than filling ' +
    'the gap. Respond ONLY with JSON: {"summary": string, "verifiedFacts": [{"claim": string, "source": ' +
    'string (which grounding item this came from), "confidence": "high"|"medium"|"low"}], "openQuestions": ' +
    'string[], "entities": string[] (models/rules/authorities named)}.';
  const user =
    `Topic: ${topic.title}\n${topic.rationale ? `Editorial angle: ${topic.rationale}\n` : ''}` +
    `${topic.category ? `Category: ${topic.category}\n` : ''}\n${grounding}` +
    (sourceNotes?.trim() ? `\n\nADMIN-SUPPLIED SOURCE NOTES/LINKS:\n${sourceNotes.trim()}` : '');
  const data = await completeJSON<any>(user, { system, provider, deadline, maxTokens: 3000 });
  return {
    summary: data.summary || '',
    verifiedFacts: Array.isArray(data.verifiedFacts) ? data.verifiedFacts : [],
    openQuestions: Array.isArray(data.openQuestions) ? data.openQuestions : [],
    entities: Array.isArray(data.entities) ? data.entities : [],
  };
}

// ---------------------------------------------------------------------------------------------
// Stage: Originality kill-switch (evchd-specific -- no gmada equivalent). Ported from the old
// engine's critique.md / scripts/lib/claude.mjs critique(). Runs right after draft, before
// humanize: a commodity/generic article, or one that breaks brand-neutrality, is killed here
// rather than being polished and shipped.
// ---------------------------------------------------------------------------------------------

export interface OriginalityVerdict {
  isCommodity: boolean;
  reason: string;
}

export async function checkOriginality(contentMarkdown: string, provider: string, deadline?: number): Promise<OriginalityVerdict> {
  const system =
    'You are the originality gate for EV Chandigarh, an informational site for the Tricity ' +
    '(Chandigarh, Mohali, Panchkula) covering low-speed electric scooters. Your single job is to ' +
    'protect the site from publishing commodity content that reads like a generic AI answer.\n\n' +
    'Judge the article body against exactly this question: would a reader get this exact value from a ' +
    'generic AI answer that has no local Tricity knowledge? If yes, it is commodity -- do not publish.\n\n' +
    'An article is NOT commodity when it delivers something a generic answer could not: a real ' +
    'Tricity-specific angle, the local tariff math, the exact <=25 km/h / <=250W exemption nuance, the ' +
    'avoided-cost value split, or concrete regional detail -- grounded and specific, not generic filler.\n\n' +
    'Brand-neutrality is also a publish-blocker: every page must be useful and honest to a reader who buys ' +
    'a non-featured model. Compare by class and spec; name brands only as examples; never call one brand ' +
    '"recommended"; prices are bands, never exact per-SKU figures. If the article pushes a single brand, ' +
    'calls one model "recommended", or quotes exact per-SKU prices, it fails this check.\n\n' +
    'Respond ONLY with JSON: {"isCommodity": boolean, "reason": string (one short sentence)}.';
  const data = await completeJSON<OriginalityVerdict>(contentMarkdown, { system, provider, deadline, maxTokens: 300 });
  return { isCommodity: Boolean(data.isCommodity), reason: data.reason || '' };
}

// ---------------------------------------------------------------------------------------------
// Stage: Draft
// ---------------------------------------------------------------------------------------------

export interface DraftResult {
  title: string;
  excerpt: string;
  contentMarkdown: string;
  category: string;
  tags: string[];
  keywords: string[];
}

export async function draftArticle(
  topic: { title: string; rationale?: string; category?: string },
  lang: Lang,
  length: ArticleLength,
  researchPacket: ResearchPacket,
  grounding: string,
  categories: readonly string[],
  provider: string,
  deadline?: number,
  sourceNotes?: string,
): Promise<DraftResult> {
  const system =
    `${editorialSystemPreamble()}\n\n${langRules(lang)}\n\nWrite a complete, well-structured blog article in ` +
    'Markdown (## headings, varied paragraph lengths, occasional bullet lists only where a list is genuinely ' +
    'clearer than prose). Length is a REQUIREMENT: contentMarkdown MUST be ' + LENGTH_SPEC[length] + ' -- a ' +
    'draft under that range is incomplete, even if every fact is accurate. Structure: a lead that answers the ' +
    'main question in the first 1-2 sentences specifically -- a direct, plain, quotable sentence an answer ' +
    'engine or search snippet could lift on its own, not a build-up to the answer; then the local angle in ' +
    'concrete terms; the relevant rule/spec/tariff, cited to its source; practical numbers as bands, never ' +
    'exact; a brief comparison-by-class section if genuinely useful; a "## Sources" section as the final ' +
    'section listing what you relied on. Do not start consecutive paragraphs with the same word or ' +
    'construction ("The...", "This...", "According to...", "Additionally..."). Do not open with an ' +
    'appositive construction ("[X], a [description], has...") -- lead with the fact itself. Base every ' +
    'factual claim on the research packet -- do not introduce facts absent from it.\n\n' +
    'Five patterns to avoid entirely:\n' +
    '1. A bullet list of unanswered rhetorical questions. If the research packet does not answer a question, ' +
    'do not ask it -- omit it entirely.\n' +
    '2. A speculative "impact on buyers" paragraph built from hedge words instead of sourced facts.\n' +
    '3. A generic "watch next"/"stay informed" closer without naming a specific document or date.\n' +
    '4. Editorializing about a source\'s reliability -- just cite it.\n' +
    '5. Piling up hedge words in a single paragraph -- state plainly what IS confirmed and stop.\n\n' +
    'Respond ONLY with JSON: {"title": string, "excerpt": string (1-2 sentences, <=200 chars), ' +
    '"contentMarkdown": string, "category": string (one of: ' + categories.join(' | ') + '), "tags": string[] ' +
    '(3-6 short tags), "keywords": string[] (3-6 SEO keywords/phrases)}. Do not include the title as a ' +
    'heading inside contentMarkdown (it is rendered separately) -- start straight into the article body.';
  const user =
    `Topic: ${topic.title}\n${topic.rationale ? `Editorial angle: ${topic.rationale}\n` : ''}` +
    `${topic.category ? `Suggested category: ${topic.category}\n` : ''}\n` +
    `RESEARCH PACKET:\n${JSON.stringify(researchPacket, null, 2)}\n\n${grounding}` +
    (sourceNotes?.trim()
      ? `\n\nADMIN INSTRUCTIONS FOR THIS ARTICLE (tone/angle/emphasis; still subject to the no-fabrication ` +
        `rules above):\n${sourceNotes.trim()}`
      : '');
  const data = await completeJSON<any>(user, { system, provider, deadline, maxTokens: 6000 });
  const { markdown: cleaned } = applyDeterministicCleanup(data.contentMarkdown || '');
  return {
    title: data.title || topic.title,
    excerpt: data.excerpt || '',
    contentMarkdown: cleaned,
    category: categories.includes(data.category) ? data.category : (topic.category || categories[0]),
    tags: Array.isArray(data.tags) ? data.tags : [],
    keywords: Array.isArray(data.keywords) ? data.keywords : [],
  };
}

export function wordCount(markdown: string): number {
  return markdown.trim().split(/\s+/).filter(Boolean).length;
}

export function lengthFloor(length: ArticleLength): number {
  return Math.round(LENGTH_TARGETS[length].min * 0.85);
}

const MAX_EXPAND_ATTEMPTS = 2;

export async function ensureLengthFloor(
  title: string,
  contentMarkdown: string,
  length: ArticleLength,
  researchPacket: ResearchPacket,
  provider: string,
  deadline: number = Infinity,
  onAttempt?: (words: number, attempt: number) => void,
): Promise<string> {
  let current = contentMarkdown;
  let words = wordCount(current);
  let attempt = 0;
  while (words < lengthFloor(length) && attempt < MAX_EXPAND_ATTEMPTS && Date.now() < deadline) {
    attempt += 1;
    onAttempt?.(words, attempt);
    const expanded = await expandArticle(title, current, length, researchPacket, provider, deadline);
    current = expanded.contentMarkdown;
    words = wordCount(current);
  }
  return current;
}

export async function expandArticle(
  title: string,
  contentMarkdown: string,
  length: ArticleLength,
  researchPacket: ResearchPacket,
  provider: string,
  deadline?: number,
): Promise<{ contentMarkdown: string }> {
  const currentWords = wordCount(contentMarkdown);
  const system =
    `${editorialSystemPreamble()}\n\nThe article below is shorter than its target length (currently about ` +
    `${currentWords} words; it needs to be ${LENGTH_SPEC[length]}). Expand it with more specific, sourced ` +
    'detail pulled from the research packet -- do not pad with filler, repetition, or speculation. Keep every ' +
    'existing fact/figure exactly as given, keep the overall structure, and keep the same natural, ' +
    'non-AI-sounding prose style. Respond ONLY with JSON: {"contentMarkdown": string (the full expanded article)}.';
  const user = `Title: ${title}\n\nCURRENT ARTICLE:\n${contentMarkdown}\n\nRESEARCH PACKET:\n${JSON.stringify(researchPacket, null, 2)}`;
  const data = await completeJSON<any>(user, { system, provider, deadline, maxTokens: 6000 });
  const { markdown: cleaned } = applyDeterministicCleanup(data.contentMarkdown || contentMarkdown);
  return { contentMarkdown: cleaned };
}

/** Free-form, admin-typed edit against an already-drafted article ("add a paragraph about X",
 * "mention Y", "shorten the intro"). Single-shot, not looped. */
export async function applyCustomInstruction(
  title: string,
  contentMarkdown: string,
  instruction: string,
  provider: string,
  deadline?: number,
): Promise<{ contentMarkdown: string }> {
  const system =
    `${editorialSystemPreamble()}\n\nThe admin has given a specific instruction for this already-drafted ` +
    'article -- apply it directly. This could mean appending a paragraph, revising a section, or a ' +
    'tone/emphasis change -- follow the instruction as literally and completely as you can. Keep every ' +
    'existing fact/figure/section not affected by the instruction exactly as given -- this is a targeted ' +
    'edit, not a rewrite. If the instruction asks for a fact/figure not already present and not supported by ' +
    'the grounding data, note the gap rather than inventing one. Respond ONLY with JSON: {"contentMarkdown": ' +
    'string (the full article, including the applied change)}.';
  const user = `Title: ${title}\n\nADMIN INSTRUCTION:\n${instruction}\n\nCURRENT ARTICLE:\n${contentMarkdown}`;
  const data = await completeJSON<any>(user, { system, provider, deadline, maxTokens: 6000 });
  const { markdown: cleaned } = applyDeterministicCleanup(data.contentMarkdown || contentMarkdown);
  return { contentMarkdown: cleaned };
}

// ---------------------------------------------------------------------------------------------
// Stage: Humanize
// ---------------------------------------------------------------------------------------------

export interface HumanizeResult {
  contentMarkdown: string;
  qualityNote: string;
}

export async function humanizeArticle(
  title: string,
  contentMarkdown: string,
  provider: string,
  stillFlagged?: string[],
  deadline?: number,
): Promise<HumanizeResult> {
  const system =
    `${editorialSystemPreamble()}\n\nRevise the article below: vary sentence rhythm, cut repetitive ` +
    `AI-sounding phrasing and filler transitions (examples to avoid or rewrite when they add no specific ` +
    `meaning: ${HUMANIZER_PHRASE_LIST}), keep every fact/figure exactly as given (do not add or remove ` +
    'claims). Also actively fix: bullet lists of unanswered rhetorical questions (cut, or state what IS ' +
    'known); hedge-word-heavy speculation piled up in one paragraph (state what is confirmed, stop); an ' +
    'appositive-opener sentence (rewrite to lead with the fact); a generic "monitor/keep an eye on" closer ' +
    'with no specific next step named; a closing paragraph that praises a source as "reliable/thorough" ' +
    '(just cite it). Respond ONLY with JSON: {"contentMarkdown": string (the revised article), "qualityNote": ' +
    'string (1 sentence describing what was tightened)}.';
  const user =
    `Title: ${title}\n\n${contentMarkdown}` +
    (stillFlagged?.length
      ? `\n\nA prior pass missed these -- they are still present and MUST be rewritten or removed this time: ${stillFlagged.join('; ')}`
      : '');
  const data = await completeJSON<any>(user, { system, provider, deadline, maxTokens: 6000 });
  const { markdown: cleaned } = applyDeterministicCleanup(data.contentMarkdown || contentMarkdown);
  return { contentMarkdown: cleaned, qualityNote: data.qualityNote || '' };
}

/** Bounded humanize loop: after each pass, re-scan for forbidden language and the AI-pattern
 * score; if either is still flagged, humanize again with the specific remaining issues named
 * explicitly. Tuned tighter than the gmada reference (SCORE_THRESHOLD 85->90, MAX_PASSES 3->4)
 * per an explicit request to push detectability further down, not just match the baseline. */
export async function humanizeWithQualityLoop(
  title: string,
  contentMarkdown: string,
  provider: string,
  deadline: number = Infinity,
): Promise<HumanizeResult & { aiPatternCheck: AiPatternResult; passes: number }> {
  const MAX_PASSES = 4;
  const SCORE_THRESHOLD = 90;

  let result = await humanizeArticle(title, contentMarkdown, provider, undefined, deadline);
  let check = checkAiPatterns(result.contentMarkdown);
  let passes = 1;

  while (
    passes < MAX_PASSES && Date.now() < deadline &&
    (check.score < SCORE_THRESHOLD || scanForbiddenLanguage(result.contentMarkdown).length > 0)
  ) {
    const stillFlagged = [
      ...scanForbiddenLanguage(result.contentMarkdown).slice(0, 8).map((h) => h.term),
      ...check.flags,
    ];
    result = await humanizeArticle(title, result.contentMarkdown, provider, stillFlagged, deadline);
    check = checkAiPatterns(result.contentMarkdown);
    passes += 1;
  }

  return { ...result, aiPatternCheck: check, passes };
}

// ---------------------------------------------------------------------------------------------
// Stage: Fact Check -- severity taxonomy (critical halts, warning logs) ported from the old
// engine's factcheck.md, extended (beyond the old file-mode engine) to also attempt an automatic
// fix in revisedMarkdown, matching gmada's fact-check stage.
// ---------------------------------------------------------------------------------------------

export interface FactCheckIssue {
  severity: 'critical' | 'warning';
  claim: string;
  problem: string;
}

export interface FactCheckResult {
  issues: FactCheckIssue[];
  revisedMarkdown: string;
  blockers: FactCheckIssue[]; // the critical subset of `issues`, for the editorial gate
}

export async function factCheckArticle(
  contentMarkdown: string,
  grounding: string,
  provider: string,
  deadline?: number,
): Promise<FactCheckResult> {
  const system =
    `${editorialSystemPreamble()}\n\nCross-check every factual claim in the article against the verified ` +
    'local facts / models data below -- that data is the source of truth.\n\nSeverity -- read carefully, it ' +
    'controls whether we publish. "critical" (HALTS publication) -- use ONLY when one of these is true: ' +
    '(1) Factual contradiction: a claim contradicts the data layer -- a wrong tariff, range, price, rule, ' +
    'date, saving, or spec. (2) Fabricated/unverifiable figure stated as fact: a number, scheme, date, or ' +
    'spec not supported anywhere in the data, presented as established fact. (3) Value-split error: implying ' +
    'low-speed scooters get PM E-DRIVE or any subsidy, or mixing the avoided-cost story with the subsidy ' +
    'story. "warning" (LOGGED, does not block) -- everything else: stylistic/tone/clarity notes, ' +
    '"verify before publish" reminders that don\'t point to an actual contradiction, anything you are not ' +
    'certain is a genuine critical-bucket error. When in doubt, choose warning -- reserve critical for errors ' +
    'that would genuinely mislead a buyer. Where a claim is critical, rewrite that sentence in ' +
    'revisedMarkdown to narrow or remove the unsupported part rather than leaving it in silently. Respond ' +
    'ONLY with JSON: {"issues": [{"severity": "critical"|"warning", "claim": string (exact claim text from ' +
    'the article), "problem": string (what is wrong, referencing the data layer)}], "revisedMarkdown": ' +
    'string (the full article with critical-issue fixes applied)}.';
  const user = `${grounding}\n\nARTICLE:\n${contentMarkdown}`;
  const data = await completeJSON<any>(user, { system, provider, deadline, maxTokens: 6000 });
  const { markdown: cleaned } = applyDeterministicCleanup(data.revisedMarkdown || contentMarkdown);
  const issues: FactCheckIssue[] = Array.isArray(data.issues)
    ? data.issues.map((i: any) => ({
        severity: i?.severity === 'critical' ? 'critical' : 'warning',
        claim: i?.claim || '',
        problem: i?.problem || '',
      }))
    : [];
  return { issues, revisedMarkdown: cleaned, blockers: issues.filter((i) => i.severity === 'critical') };
}

// ---------------------------------------------------------------------------------------------
// Stage: SEO Optimize
// ---------------------------------------------------------------------------------------------

export interface SeoReport {
  primaryQuery: string;
  secondaryQueries: string[];
  longTailQueries: string[];
  questionQueries: string[];
  seoTitle: string;
  seoDescription: string;
  keywords: string[];
  headingSuggestions: string[];
  internalLinkSuggestions: { anchorText: string; url: string; reason: string }[];
}

export async function seoOptimize(
  title: string,
  contentMarkdown: string,
  focusKeyword: string | undefined,
  linkCandidates: InternalLinkCandidate[],
  provider: string,
  deadline?: number,
): Promise<SeoReport> {
  const system =
    `${editorialSystemPreamble()}\n\nOptimize this article for organic search without making it sound ` +
    'SEO-written: identify primary/secondary/long-tail/question-style search intent, write an accurate ' +
    'meta title (<=60 chars) and meta description (<=160 chars) that describes the page and gives a reason ' +
    'to click without exaggeration, and suggest natural keywords using the language readers actually use. Do ' +
    'not force keyword density. Review the candidate internal-link targets below and suggest 2-5 that would ' +
    'genuinely help a reader -- candidates only, not auto-inserted, so pick ones an editor would actually ' +
    'want and give natural anchor text (never "click here"). Respond ONLY with JSON: {"primaryQuery": ' +
    'string, "secondaryQueries": string[] (2-4), "longTailQueries": string[] (2-4), "questionQueries": ' +
    'string[] (2-3), "seoTitle": string, "seoDescription": string, "keywords": string[] (3-6), ' +
    '"headingSuggestions": string[] (0-3, empty if fine), "internalLinkSuggestions": [{"anchorText": string, ' +
    '"url": string (must be one of the candidate URLs below, verbatim), "reason": string}] (0-5, empty if ' +
    'none genuinely fit)}.';
  const candidateList = linkCandidates.length
    ? linkCandidates.map((c) => `- ${c.title}: ${c.url}`).join('\n')
    : '(none available)';
  const user =
    `Title: ${title}\n${focusKeyword ? `Focus keyword to naturally emphasize: ${focusKeyword}\n` : ''}\n` +
    `CANDIDATE INTERNAL-LINK TARGETS:\n${candidateList}\n\n${contentMarkdown}`;
  const data = await completeJSON<any>(user, { system, provider, deadline, maxTokens: 2000 });
  const validUrls = new Set(linkCandidates.map((c) => c.url));
  const internalLinkSuggestions = (Array.isArray(data.internalLinkSuggestions) ? data.internalLinkSuggestions : [])
    .filter((s: any) => s?.url && validUrls.has(s.url) && s?.anchorText)
    .map((s: any) => ({ anchorText: s.anchorText, url: s.url, reason: s.reason || '' }));
  return {
    primaryQuery: data.primaryQuery || '',
    secondaryQueries: Array.isArray(data.secondaryQueries) ? data.secondaryQueries : [],
    longTailQueries: Array.isArray(data.longTailQueries) ? data.longTailQueries : [],
    questionQueries: Array.isArray(data.questionQueries) ? data.questionQueries : [],
    seoTitle: (data.seoTitle || title).slice(0, 70),
    seoDescription: (data.seoDescription || '').slice(0, 180),
    keywords: Array.isArray(data.keywords) ? data.keywords : [],
    headingSuggestions: Array.isArray(data.headingSuggestions) ? data.headingSuggestions : [],
    internalLinkSuggestions,
  };
}

function escapeRegExpLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Places seoOptimize()'s internal-link suggestions into the article body -- code-only, no AI
 * call, so it can never invent a link. Ported verbatim (pure function, no site-specific logic). */
export function applyInternalLinks(
  markdown: string,
  suggestions: { anchorText: string; url: string; reason?: string }[],
): { markdown: string; inserted: { anchorText: string; url: string }[]; skipped: { anchorText: string; url: string }[] } {
  const lines = markdown.split('\n');
  const remaining = suggestions.slice();
  const inserted: { anchorText: string; url: string }[] = [];
  let inFence = false;

  for (let i = 0; i < lines.length && remaining.length; i++) {
    const raw = lines[i];
    if (/^```/.test(raw.trim())) { inFence = !inFence; continue; }
    if (inFence) continue;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('>') || trimmed.startsWith('|')) continue;

    const placeholders: string[] = [];
    const tokenFor = (idx: number) => 'INTERNALLINKTOKEN' + idx + 'ENDTOKEN';
    const protectedLine = raw.replace(/\[[^\]]*\]\([^)]*\)/g, (m) => {
      const token = tokenFor(placeholders.length);
      placeholders.push(m);
      return token;
    });

    for (let s = 0; s < remaining.length; s++) {
      const { anchorText, url } = remaining[s];
      if (!anchorText || !url) continue;
      const re = new RegExp('\\b' + escapeRegExpLiteral(anchorText) + '\\b', 'i');
      const match = re.exec(protectedLine);
      if (!match) continue;
      const withLink =
        protectedLine.slice(0, match.index) + '[' + match[0] + '](' + url + ')' + protectedLine.slice(match.index + match[0].length);
      let restored = withLink;
      placeholders.forEach((original, idx) => {
        restored = restored.split(tokenFor(idx)).join(original);
      });
      lines[i] = restored;
      inserted.push({ anchorText: match[0], url });
      remaining.splice(s, 1);
      break;
    }
  }

  return { markdown: lines.join('\n'), inserted, skipped: remaining.map((r) => ({ anchorText: r.anchorText, url: r.url })) };
}

// ---------------------------------------------------------------------------------------------
// Stage: AI Search Optimize
// ---------------------------------------------------------------------------------------------

export interface AiSearchReport {
  notes: string[];
  contentMarkdown: string;
}

export async function aiSearchOptimize(contentMarkdown: string, provider: string, deadline?: number): Promise<AiSearchReport> {
  const system =
    `${editorialSystemPreamble()}\n\nReview this article for how easily an AI answer engine could extract ` +
    'and cite its facts: does it answer the core question early, state exact entities/specs rather than ' +
    'vague references, and define terminology when needed? Do NOT add answer-engine-style language or ' +
    'artificial FAQ sections just to target snippets. Only change sections that genuinely lack clarity -- if ' +
    'already clear, return unchanged. Respond ONLY with JSON: {"notes": string[] (empty if nothing changed), ' +
    '"contentMarkdown": string (the full article, revised only where needed)}.';
  const data = await completeJSON<any>(contentMarkdown, { system, provider, deadline, maxTokens: 6000 });
  const { markdown: cleaned } = applyDeterministicCleanup(data.contentMarkdown || contentMarkdown);
  return { notes: Array.isArray(data.notes) ? data.notes : [], contentMarkdown: cleaned };
}

// ---------------------------------------------------------------------------------------------
// Stage: Editorial Review -- the final gate.
// ---------------------------------------------------------------------------------------------

export interface EditorialReviewInput {
  title: string;
  contentMarkdown: string;
  seoTitle: string;
  seoDescription: string;
  category: string;
  factCheckBlockers: FactCheckIssue[];
  duplicateVerdict: string;
  conclusionHeadingStripped: boolean;
  bannedPunctuationStripped: boolean;
  aiPatternScore: number;
  similarityStatus: string;
  isCommodity: boolean;
}

export interface EditorialReview {
  verdict: 'PASS' | 'FAIL';
  blockers: string[];
}

export async function runEditorialReview(input: EditorialReviewInput, provider: string, deadline?: number): Promise<EditorialReview> {
  const system =
    `${editorialSystemPreamble()}\n\nRun the final editorial gate on this article against this checklist: ` +
    'Accuracy (material claims fact-checked, no fabricated claims), Originality (not commodity/generic, not ' +
    'a duplicate, brand-neutral), Human quality (no generic AI opening, no formulaic transitions, no ' +
    '"Conclusion" section, no em dashes or semicolons), SEO (title/meta accurate, headings descriptive), ' +
    'Site identity (evchandigarh.in never represented as a dealer or official government site). Known ' +
    'inputs from earlier pipeline stages are provided below -- factor them in (a fact-check blocker, a ' +
    'DUPLICATE verdict, isCommodity=true, a low AI-pattern score, or a FAIL similarity status should ' +
    'normally fail the gate). The cover image is generated manually by the admin after this review -- do not ' +
    'treat a missing image as a blocker. Respond ONLY with JSON: {"verdict": "PASS"|"FAIL", "blockers": ' +
    'string[] (empty if PASS; do not omit a real issue to force a PASS)}.';
  const user = [
    `Title: ${input.title}`,
    `SEO title: ${input.seoTitle}`,
    `SEO description: ${input.seoDescription}`,
    `Category: ${input.category}`,
    `Duplicate-check verdict: ${input.duplicateVerdict}`,
    `Commodity/originality check: ${input.isCommodity ? 'FAILED (flagged as commodity/generic)' : 'passed'}`,
    `Fact-check blockers carried in: ${input.factCheckBlockers.length ? input.factCheckBlockers.map((b) => b.problem).join('; ') : '(none)'}`,
    `Conclusion heading auto-stripped: ${input.conclusionHeadingStripped ? 'yes' : 'no'}`,
    `Em dash(es)/semicolon(s) auto-stripped: ${input.bannedPunctuationStripped ? 'yes' : 'no'}`,
    `AI-pattern score (0-100, higher = more human-sounding): ${input.aiPatternScore}`,
    `Similarity/plagiarism-screening status: ${input.similarityStatus}`,
    '',
    'ARTICLE:',
    input.contentMarkdown,
  ].join('\n');
  const data = await completeJSON<any>(user, { system, provider, deadline, maxTokens: 1000 });
  const blockers = Array.isArray(data.blockers) ? data.blockers : [];
  return { verdict: data.verdict === 'PASS' && blockers.length === 0 ? 'PASS' : 'FAIL', blockers };
}
