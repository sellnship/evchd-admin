// Server-only. Deterministic scan for AI-cliche vocabulary and opening lines -- prompts can only
// *ask* the model to avoid these; this actually scans the output, so a violation is caught even
// when the model ignores the instruction. Ported verbatim from gmadanew-inspect's
// forbiddenLanguage.ts. Quoted/official material is exempt (blockquote lines and fenced code
// blocks are skipped) -- quotations should never be altered to satisfy the blacklist.

export const HARD_BAN_WORDS = [
  'delve', 'tapestry', 'pivotal', 'crucial', 'intricate', 'leverage', 'realm', 'underscore',
  'elevate', 'resonate', 'embark', 'harness', 'foster', 'fostering', 'multifaceted', 'nuanced',
  'robust', 'strive', 'tailor', 'synergy', 'empower', 'unleash', 'unlock', 'enhance', 'expertise',
  'offerings', 'valuable', 'invaluable', 'relentless', 'groundbreaking', 'endeavour', 'endeavor',
  'enlightening', 'insights', 'esteemed', 'cognizant', 'conceptualize', 'systemic', 'inherent',
  'testament', 'peril', 'landscape', 'pertinent', 'explore', 'amplify', 'adhere', 'unravel',
  'paramount', 'characterized', 'significant', 'profound', 'facilitate', 'encompass', 'elucidate',
  'cultivate', 'integral', 'implications', 'perspectives', 'holistic', 'discern', 'complexity',
  'recognize', 'adapt', 'promote', 'critique', 'comprehensive',
  'imperative', 'vital', 'nurture', 'fundamental', 'demystify', 'foray', 'transformative',
] as const;

export const HARD_BAN_PHRASES = [
  'delve into', 'delve deeper into', 'in the ever-evolving world of', 'it is important to note',
  'it is important to remember', 'a stark reminder', 'a nuanced understanding', 'in the realm of',
  "today's fast-paced world", "today's rapidly evolving world", 'aims to explore',
  'fostering a sense of', 'at the end of the day', 'in conclusion', 'deep understanding',
  'provide valuable insights', 'provide a valuable insight', 'gain valuable insights',
  'offers valuable insights', 'provides valuable insights', 'gain a deeper understanding',
  'gain an insight', 'play a pivotal role', 'a pivotal moment', 'play a crucial role',
  'the transformative power', 'an unwavering commitment', 'the relentless pursuit',
  'emphasize the need', 'emphasize the importance', 'highlight the potential',
  'highlight the need', 'a significant milestone', 'far-reaching implications',
  'a comprehensive framework', 'a comprehensive understanding', 'a comprehensive overview',
  'a broad understanding', 'the complex interplay', 'the intricate relationship',
  'pave the way for the future', 'a significant step forward', 'leave a lasting impact',
  'leave an indelible mark', 'an indelible mark', 'add a layer of complexity',
  'offer a valuable opportunity', 'open new avenues', 'a new avenue', 'the journey begins',
  'a delicate balance', 'the path ahead', 'lay the groundwork', 'particularly with regard to',
  'address the root cause', 'loom large in', 'an ongoing dialogue', 'ability to navigate',
  'potentially lead to', 'ready to embrace', 'stand in stark contrast',
  'raise an important question', 'make an informed decision in regard to',
  'the evidence base for decision making', 'identify an area of improvement',
  'an initiative aims to', 'offering a unique',
  'remain unclear', 'remains unclear', 'could greatly affect', 'could raise concerns',
  'is marked by', 'not specified in the available information', 'should keep an eye on',
  'encouraged to monitor', 'serve as primary resources', 'thorough and reliable information',
  'remaining informed', 'essential to understanding', 'key questions for residents',
  'key questions for stakeholders', 'prospective buyers are encouraged',
  'residents and prospective buyers should', 'residents should keep an eye',
  'as this ambitious initiative unfolds', 'as this initiative unfolds',
  'the exact timeline for completion', 'greatly affect property values',
  'may draw home buyers', 'raise concerns about potential disruptions',
  'beacon of', 'circle back', 'dive deep', 'navigating the challenges', 'navigating the complexities',
  'in short', 'in summary', 'cannot be overstated',
] as const;

// Cliched AI-tell OPENING lines. Position-specific, unlike HARD_BAN_PHRASES above: these read as
// a red flag specifically when they open the article, not necessarily if they appear deep in the
// body -- so scanOpeningCliche() below checks only the first ~200 characters.
export const OPENING_CLICHE_PHRASES = [
  'in a world where', 'imagine a world where', 'imagine this', 'picture this',
  "it's no secret that", 'it is no secret that', "let's face it", 'as we navigate',
  'gone are the days', 'fast forward to today', 'now more than ever', 'at its core',
  'in the digital age', 'in an era where', 'in the dynamic world of',
  "in today's fast-paced", 'in the ever-evolving landscape of',
] as const;

export interface ForbiddenHit {
  term: string;
  kind: 'word' | 'phrase';
  count: number;
  excerpt: string;
}

/** Strips fenced code blocks and blockquote lines before scanning -- both are places quoted/
 * official source material legitimately lives, and quotations must not be altered to satisfy the
 * blacklist. */
function stripExemptRegions(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .split('\n')
    .filter((line) => !line.trim().startsWith('>'))
    .join('\n');
}

function firstExcerpt(text: string, index: number, len: number): string {
  const start = Math.max(0, index - 30);
  const end = Math.min(text.length, index + len + 30);
  return `…${text.slice(start, end).trim()}…`;
}

export function scanForbiddenLanguage(markdown: string): ForbiddenHit[] {
  const scannable = stripExemptRegions(markdown);
  const hits: ForbiddenHit[] = [];

  // Em dashes are banned outright (not just "excessive"), per explicit product decision. Counted
  // here so a single occurrence blocks the humanizeWithQualityLoop retry gate the same way any
  // other forbidden phrase does.
  const emDashRe = /—/g;
  let emDashMatch: RegExpExecArray | null;
  let emDashCount = 0;
  let emDashFirstIndex = -1;
  while ((emDashMatch = emDashRe.exec(scannable))) {
    emDashCount += 1;
    if (emDashFirstIndex === -1) emDashFirstIndex = emDashMatch.index;
  }
  if (emDashCount > 0) {
    hits.push({ term: 'em dash (—)', kind: 'word', count: emDashCount, excerpt: firstExcerpt(scannable, emDashFirstIndex, 1) });
  }

  // Semicolons are also banned outright, same reasoning as em dashes above.
  const semicolonRe = /;/g;
  let semicolonMatch: RegExpExecArray | null;
  let semicolonCount = 0;
  let semicolonFirstIndex = -1;
  while ((semicolonMatch = semicolonRe.exec(scannable))) {
    semicolonCount += 1;
    if (semicolonFirstIndex === -1) semicolonFirstIndex = semicolonMatch.index;
  }
  if (semicolonCount > 0) {
    hits.push({ term: 'semicolon (;)', kind: 'word', count: semicolonCount, excerpt: firstExcerpt(scannable, semicolonFirstIndex, 1) });
  }

  for (const phrase of HARD_BAN_PHRASES) {
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    let match: RegExpExecArray | null;
    let count = 0;
    let firstIndex = -1;
    while ((match = re.exec(scannable))) {
      count += 1;
      if (firstIndex === -1) firstIndex = match.index;
    }
    if (count > 0) hits.push({ term: phrase, kind: 'phrase', count, excerpt: firstExcerpt(scannable, firstIndex, phrase.length) });
  }

  for (const word of HARD_BAN_WORDS) {
    // Matches common conjugations too (foster -> fostering/fosters/fostered).
    const re = new RegExp(`\\b${word}(?:s|ed|ing)?\\b`, 'gi');
    let match: RegExpExecArray | null;
    let count = 0;
    let firstIndex = -1;
    while ((match = re.exec(scannable))) {
      count += 1;
      if (firstIndex === -1) firstIndex = match.index;
    }
    if (count > 0) hits.push({ term: word, kind: 'word', count, excerpt: firstExcerpt(scannable, firstIndex, word.length) });
  }

  return hits.sort((a, b) => b.count - a.count);
}

/** Checks only the article's opening (first ~200 characters of the first non-heading paragraph,
 * after stripping exempt regions) against OPENING_CLICHE_PHRASES. Returns the matched phrase, or
 * null if the opening is clean. */
export function scanOpeningCliche(markdown: string): string | null {
  const scannable = stripExemptRegions(markdown);
  const firstParagraph = scannable
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith('#')) || '';
  const opening = firstParagraph.slice(0, 200).toLowerCase();
  for (const phrase of OPENING_CLICHE_PHRASES) {
    if (opening.includes(phrase)) return phrase;
  }
  return null;
}
