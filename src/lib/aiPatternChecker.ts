// Server-only. Every metric here (repeated openers, paragraph-length uniformity, punctuation
// frequency, forbidden vocabulary) is objectively computable from the text itself, so this runs
// as a plain function rather than another AI call: cheaper, instant, and the checker can't itself
// hallucinate a score. Ported verbatim from gmadanew-inspect's aiPatternChecker.ts -- every
// deduction here traces to a real ZeroGPT-flagged article the original comments cite as evidence,
// so this is deliberately not "improved" beyond the humanize-loop threshold tuning in
// blogPipeline.ts (see humanizeWithQualityLoop's SCORE_THRESHOLD/MAX_PASSES).
import { scanForbiddenLanguage, scanOpeningCliche } from './forbiddenLanguage';

export interface AiPatternResult {
  score: number; // 0-100, higher is better (more human-sounding)
  flags: string[];
}

function paragraphs(markdown: string): string[] {
  return markdown
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith('#') && !p.startsWith('|') && !p.startsWith('```'));
}

function stddev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
}

export function checkAiPatterns(markdown: string): AiPatternResult {
  const flags: string[] = [];
  let deductions = 0;

  const forbiddenHits = scanForbiddenLanguage(markdown);
  const forbiddenTotal = forbiddenHits.reduce((sum, h) => sum + h.count, 0);
  if (forbiddenTotal > 0) {
    deductions += Math.min(40, forbiddenTotal * 6);
    flags.push(`${forbiddenTotal} forbidden AI-cliche word/phrase occurrence(s) (${forbiddenHits.slice(0, 5).map((h) => h.term).join(', ')}${forbiddenHits.length > 5 ? ', …' : ''})`);
  }

  const paras = paragraphs(markdown);
  const wordCounts = paras.map((p) => p.split(/\s+/).filter(Boolean).length);
  const totalWords = wordCounts.reduce((a, b) => a + b, 0) || 1;

  // Repeated paragraph openers -- same first 3 words starting >2 paragraphs.
  const openerCounts = new Map<string, number>();
  for (const p of paras) {
    const opener = p.split(/\s+/).slice(0, 3).join(' ').toLowerCase().replace(/[^a-z0-9\s]/g, '');
    if (opener) openerCounts.set(opener, (openerCounts.get(opener) || 0) + 1);
  }
  const repeatedOpeners = [...openerCounts.entries()].filter(([, c]) => c > 2);
  if (repeatedOpeners.length) {
    deductions += 10;
    flags.push(`Repeated paragraph opener "${repeatedOpeners[0][0]}" used ${repeatedOpeners[0][1]} times`);
  }

  // Paragraph-length uniformity -- real writing varies; a suspiciously low stddev is a template-y
  // tell. Only meaningful with enough paragraphs.
  if (paras.length >= 5) {
    const sd = stddev(wordCounts);
    const mean = totalWords / paras.length;
    if (mean > 0 && sd / mean < 0.15) {
      deductions += 10;
      flags.push('Paragraph lengths are unusually uniform (little variation)');
    }
  }

  // Em dashes and semicolons are both a hard ban in forbiddenLanguage.ts (any single occurrence
  // blocks the humanize retry loop) plus a deterministic strip in blogEditorialRules.ts, so
  // neither is re-scored here to avoid double-counting the same violation.

  // Trailing participle clauses -- two-plus "-ing" clauses joined by "and" right after a comma is
  // a near-certain AI tell, weighted heavily. A single trailing "-ing" clause is softer -- ordinary
  // writing occasionally ends a sentence with one descriptive gerund clause, so it's only counted
  // once there are 2+ in the article and weighted lower than the double form.
  const doubleParticiple: string[] = markdown.match(/,\s+\w+ing\s+[^,.!?;]+?\s+and\s+\w+ing\s+[^,.!?;]+?[.!?]/g) || [];
  const allTrailingParticiples: string[] = markdown.match(/,\s+\w+ing\s+[^,.!?;]{15,}?[.!?]/g) || [];
  const singleParticiple = allTrailingParticiples.filter((s) => !doubleParticiple.includes(s));
  if (doubleParticiple.length > 0) {
    deductions += Math.min(30, doubleParticiple.length * 15);
    flags.push(
      `${doubleParticiple.length} trailing participle pile-up(s) (e.g. "${doubleParticiple[0]!.trim().slice(0, 70)}") -- cut the clause or make it its own direct sentence`,
    );
  }
  if (singleParticiple.length > 1) {
    deductions += Math.min(15, (singleParticiple.length - 1) * 8);
    flags.push(
      `${singleParticiple.length} trailing participle clause(s) (e.g. "${singleParticiple[0]!.trim().slice(0, 70)}") -- cut the clause or make it its own direct sentence`,
    );
  }

  // "not just X but also Y" / "it's not just X, it's Y" -- an overused parallel-structure tell.
  const notJustButAlso = markdown.match(/\bnot\s+just\s+[^,.!?;]+?\s+but\s+also\b/gi) || [];
  const itsNotJustItsPattern = markdown.match(/\bit'?s\s+not\s+just\s+[^,]+,\s+it'?s\b/gi) || [];
  const parallelCount = notJustButAlso.length + itsNotJustItsPattern.length;
  if (parallelCount > 0) {
    deductions += Math.min(20, parallelCount * 10);
    flags.push(`${parallelCount} "not just X but also Y" / "it's not just X, it's Y" construction(s) -- state the point plainly instead`);
  }

  // Bullet-list ratio -- lines starting with -/* vs total non-heading lines.
  const lines = markdown.split('\n').map((l) => l.trim()).filter(Boolean);
  const bulletLines = lines.filter((l) => /^[-*]\s/.test(l)).length;
  const proseLines = lines.filter((l) => !l.startsWith('#')).length || 1;
  if (bulletLines / proseLines > 0.4) {
    deductions += 8;
    flags.push('Bullet lists make up a large share of the article (prefer prose for narrative sections)');
  }

  // Rhetorical-question bullet lists -- bullets that pose unanswered questions instead of stating
  // facts is a strong, specific AI tell.
  const questionBullets = lines.filter((l) => /^[-*]\s.*\?$/.test(l)).length;
  if (questionBullets >= 2) {
    deductions += 15;
    flags.push(`${questionBullets} rhetorical question(s) in a bullet list -- state facts/next steps directly instead of posing unanswered questions`);
  }

  // Hedge-word density -- speculative "could/may/might/likely/suggests/unclear" language piled up
  // in a paragraph is exactly what external AI detectors flag hardest.
  const hedgeWords = (markdown.match(/\b(could|may|might|maybe|perhaps|likely|potentially|suggests?|indicates?|unclear|uncertain|remains? to be seen|appears? to|i think|it seems)\b/gi) || []).length;
  const hedgeRate = (hedgeWords / totalWords) * 1000;
  if (hedgeRate > 12) {
    deductions += 15;
    flags.push(`Heavy hedge-word density (${hedgeWords} hedge words in ${totalWords} words) -- replace speculation with sourced facts, or cut the sentence`);
  }

  // Appositive-opener sentences ("The X project, a development initiative in Y, has seen...") --
  // a distinctive AI construction pattern.
  const appositiveOpeners = paras.filter((p) => /^[A-Z][\w\s'-]{2,40},\s+(a|an|the)\s+[\w\s-]{3,40},\s/.test(p)).length;
  if (appositiveOpeners > 0) {
    deductions += 10;
    flags.push(`${appositiveOpeners} appositive-opener sentence(s) ("X, a Y, has...") -- lead with the fact instead`);
  }

  // Generic advice-closer paragraphs ("should monitor", "keep an eye on", "stay informed") --
  // filler that restates the obvious instead of citing a specific next document/date.
  const genericAdvice = (markdown.match(/\b(should (keep an eye on|monitor|stay informed)|encouraged to (monitor|stay informed))\b/gi) || []).length;
  if (genericAdvice > 0) {
    deductions += 10;
    flags.push('Generic "stay informed/monitor" advice without a specific next document or date -- cite the actual next step or cut the sentence');
  }

  // Adjacent-paragraph redundancy -- a model padding/coherence tic: paragraph N states a fact and
  // paragraph N+1 immediately re-says the same fact in different words instead of adding new
  // information. Measured as significant-word (stopwords stripped) overlap between consecutive
  // paragraphs -- the same shingle-overlap philosophy as similarityChecker.ts, applied within one
  // article.
  const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'of', 'in', 'on', 'for', 'to', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'this', 'that', 'these', 'those', 'with', 'as', 'at', 'by', 'from', 'it', 'its', 'has', 'have', 'had', 'will', 'which', 'who', 'their', 'not']);
  function significantWords(p: string): Set<string> {
    return new Set(p.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !STOPWORDS.has(w)));
  }
  let redundantPairs = 0;
  for (let i = 0; i < paras.length - 1; i++) {
    const a = significantWords(paras[i]);
    const b = significantWords(paras[i + 1]);
    if (a.size < 4 || b.size < 4) continue;
    const shared = [...a].filter((w) => b.has(w)).length;
    const overlapRatio = shared / Math.min(a.size, b.size);
    if (overlapRatio > 0.35) redundantPairs++;
  }
  if (redundantPairs > 0) {
    deductions += 15;
    flags.push(`${redundantPairs} pair(s) of adjacent paragraphs restate largely the same facts -- merge them or make the second paragraph add new information instead of rephrasing the first`);
  }

  // Opening-sentence AI-tell ("In a world where...", "Imagine this...", etc.) -- the single most
  // recognizable AI-tell: it's the very first thing a reader (or detector) sees.
  const openingCliche = scanOpeningCliche(markdown);
  if (openingCliche) {
    deductions += 20;
    flags.push(`Article opens with the AI-tell phrase "${openingCliche}" -- open with a concrete fact, scenario, or direct statement of the problem instead`);
  }

  // Paragraphs opening with "Ultimately," -- the word that most often introduces a
  // wrap-it-in-a-bow summary paragraph.
  const ultimatelyOpeners = paras.filter((p) => /^ultimately,/i.test(p)).length;
  if (ultimatelyOpeners > 0) {
    deductions += Math.min(15, ultimatelyOpeners * 8);
    flags.push(`${ultimatelyOpeners} paragraph(s) open with "Ultimately," -- cut the paragraph, or open with the fact directly instead`);
  }

  // Sentences starting with "So," -- checked at both paragraph starts and mid-paragraph sentence
  // starts (after ". ").
  const soOpeners = (markdown.match(/(?:^|[.!?]\s+)So,\s/gm) || []).length;
  if (soOpeners > 0) {
    deductions += Math.min(12, soOpeners * 6);
    flags.push(`${soOpeners} sentence(s) start with "So," -- rewrite without that opener`);
  }

  // Paragraphs longer than 3 sentences. Counts sentence-ending punctuation within each paragraph
  // as a rough sentence count (good enough for flagging outliers, not meant to be a precise
  // parser).
  const longParagraphs = paras.filter((p) => (p.match(/[.!?](?:\s|$)/g) || []).length > 3).length;
  if (longParagraphs > 0) {
    deductions += Math.min(15, longParagraphs * 5);
    flags.push(`${longParagraphs} paragraph(s) longer than 3 sentences -- split into shorter paragraphs`);
  }

  // Rule of Three -- balanced triplets like "fast, reliable, and secure". Only flagged once it
  // recurs (2+ times), since a single genuine three-item list isn't itself a tell -- the pattern
  // to avoid is relying on it repeatedly as a rhetorical crutch.
  const ruleOfThree = markdown.match(/\b\w+,\s+\w+,\s+and\s+\w+\b/g) || [];
  if (ruleOfThree.length > 1) {
    deductions += Math.min(15, (ruleOfThree.length - 1) * 6);
    flags.push(`${ruleOfThree.length} "X, Y, and Z" balanced-triplet construction(s) -- drop the third item and expand on one instead, or split into separate sentences`);
  }

  // "**Bold Term**: explanation" list blocks -- at most one such list in the whole article. Counts
  // a "block" as 3+ consecutive lines matching the pattern, so an isolated bold term inside
  // ordinary prose doesn't trip this.
  const boldListLines = lines.map((l) => /^[-*]\s*\*\*[^*]+\*\*:?\s/.test(l));
  let boldListBlocks = 0;
  let run = 0;
  for (const isBoldListLine of boldListLines) {
    run = isBoldListLine ? run + 1 : 0;
    if (run === 3) boldListBlocks += 1; // count the block once, when it first reaches 3
  }
  if (boldListBlocks > 1) {
    deductions += 12;
    flags.push(`${boldListBlocks} separate "**Bold Term**: explanation" list blocks -- that structure is one of the most recognizable AI tells; keep at most one such list in the article and explain the rest in prose`);
  }

  // Disguised-conclusion heading -- stripConclusionHeading() already removes a literal
  // "Conclusion" heading outright, but a renamed equivalent as the LAST heading in the article
  // ("Looking Ahead," "Final Thoughts," etc.) is the same tell under a different name.
  const headings = [...markdown.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => m[1].trim());
  const lastHeading = headings[headings.length - 1];
  if (lastHeading && /^(looking ahead|final thoughts|wrapping up|key takeaways|the bottom line|in summary)$/i.test(lastHeading)) {
    deductions += 10;
    flags.push(`Final heading "${lastHeading}" reads as a disguised "Conclusion" -- rename to something specific and topic-relevant, and check the section doesn't just recap claims already made`);
  }

  return { score: Math.max(0, 100 - deductions), flags };
}
