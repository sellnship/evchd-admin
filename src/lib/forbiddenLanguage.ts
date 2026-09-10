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
  // Added from several user-supplied AI-detector frequency tables/word lists (ranked by how many
  // times more often AI models use these vs. human writers) -- these were previously only
  // requested via the humanize prompt's HUMANIZER_WORDS list (blogEditorialRules.ts), not
  // actually scanned/enforced. Promoted here so a violation is caught even when the model ignores
  // the prompt. Includes some fiction/narrative-flavored words (e.g. "ethereal", "crescendo")
  // unlikely to ever appear in this site's factual EV-scooter content -- harmless to keep banned
  // regardless, since they simply never match real articles here.
  'cutting-edge', 'revolutionary', 'game-changing', 'innovative', 'furthermore', 'moreover',
  'additionally', 'consequently', 'nevertheless', 'advent', 'akin', 'amidst', 'arduous',
  'conversely', 'entails', 'entrenched', 'essential', 'glean', 'grasp', 'hinder', 'kaleidoscope',
  'linchpin', 'manifold', 'plethora', 'preemptively', 'pronged', 'underpins', 'unparalleled',
  'vast', 'utilize', 'streamline', 'seamlessly', 'seamless', 'scalable', 'subsequently',
  'remarkable', 'context', 'insight', 'paradigm', 'framework', 'facet', 'dynamic', 'intricacies',
  'iterative', 'confluence', 'nuance', 'underpinning', 'spectrum', 'trajectory', 'foundations',
  'intrigue', 'elusive', 'orchestra', 'intricately', 'quintessential', 'symphony', 'canvas',
  'labyrinth', 'ineffable', 'resonance', 'embodiment', 'crescendo', 'enigma', 'transcendent',
  'ephemeral', 'resplendent', 'indomitable', 'unfathomable', 'monumental', 'ethereal',
  'imperishable', 'unyielding', 'boundless', 'otherworldly', 'bioluminescent', 'luminescent',
  'mosaic', 'woven', 'sculpted', 'traversed', 'guidelines', 'boundaries', 'inevitable',
  'precision', 'surgical', 'arena', 'arsenal', 'bombard', 'bloated', 'boosts', 'breeze', 'buzz',
  'cadence', 'capture', 'captivate', 'catapult', 'compelling', 'cornerstone', 'convey', 'craft',
  'crafting', 'despair', 'diverge', 'drowning', 'embark', 'employ', 'engage', 'engaging',
  'entrusting', 'fantastic', 'fluff', 'formidable', 'gaslights', 'hone', 'imaginative',
  'incorporating', 'juggling', 'magic', 'marvelous', 'navigate', 'nimble', 'nugget', 'nutshell',
  'raves', 'revolutionize', 'scrappy', 'sifting', 'skyrocket', 'stall', 'stellar',
  'supercharge', 'surge', 'tackle', 'tightrope', 'trailblazer', 'turbocharge', 'uncover',
  'unveil', 'wedge', 'whip', 'compelling', 'fast-paced',
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
  // Added from four user-supplied AI-detector frequency tables (ranked by how many times more
  // often AI models use these vs. human writers) -- consolidated and deduplicated against the
  // list above. A few entries too garbled/incoherent to be real phrases (apparent scraping/OCR
  // artifacts like "a serf reminder", "despite the face") were left out entirely, since banning
  // literal nonsense text matches nothing in real writing.
  'left an indelible mark', 'significant role in shaping', 'broad implication', 'broad implications',
  'endure a legacy', 'underscore the importance', 'underscore the need', 'navigate the complex',
  'mark a turning point', 'hold a significant', 'a multi-faceted approach',
  'potential risk associated', 'a profound implication', 'a significant implication',
  'a unique blend', "couldn't help but wonder", 'framework for understanding',
  'laid the groundwork', 'aim to explore', 'present a unique challenge', 'provide a comprehensive',
  'shed light on', 'a diverse perspective', 'contribute to the understanding',
  'particularly noteworthy', "in today's ever-evolving world", 'in essence', 'certainly,',
  'harness the power of', 'navigate the complexities of', 'navigate the complexities',
  'unlock the potential of', 'unlock the potential', 'it is worth mentioning that',
  "it's worth noting", "it's important to note", 'seamlessly integrate',
  'at the forefront of innovation', 'a game-changing solution', 'empowering users to',
  'foster innovation', 'drive engagement', 'elevate your', 'empower individuals',
  'resonate with audiences', "in today's digital age", 'it is important to understand',
  'this is particularly true', 'one might argue that', 'it goes without saying',
  'when it comes to', 'on the other hand', 'to summarize', 'that being said',
  'with that in mind', 'in light of this',
  // Second consolidation pass: several more user-supplied lists, including basic connectives
  // ("for example", "therefore", "although", etc.) explicitly requested despite their generic,
  // everyday use elsewhere in English -- accepted deliberately, not an oversight.
  'along with', 'on the contrary', "in today's rapidly evolving market", 'at the core of',
  'a myriad of', 'on a broader scale', 'in the context of', 'from a holistic perspective',
  'taking into account', 'a dynamic interplay', 'evolving over time', 'intricacies involved',
  'a pivotal role', 'underpinning principles', 'the spectrum of', 'transformative impact',
  'little did they know', 'surgical focus', 'lethal purpose', 'silent entry', 'in fact', 'indeed',
  'absolutely', 'clearly', 'first and foremost', 'finally', 'as a result', 'therefore',
  'in other words', 'to put it simply', 'that is to say', 'to elaborate', 'for example',
  'for instance', 'such as', 'to illustrate', 'although', 'even though', 'despite',
  'while it may seem', 'all in all', 'imagine if', 'suppose that', 'what if',
  'have you ever wondered', 'what would happen if', 'how can we', "isn't it true that",
  "wouldn't you agree that", "isn't it obvious that", 'more importantly', 'even more',
  'less significant but', 'the challenge is', 'the key issue is', 'the question remains',
  "here's the kicker", 'in a sea of sameness', 'like a moth to a flame', 'in a world of',
  'to sum up', 'brain dump', 'break the bank', 'chaos into clarity', 'comes to the rescue',
  'digital world', 'elephant in the room', 'ever wondered', 'eye roll', 'fast paced world',
  'falls flat', "grabs people's attention", 'hard truth', "here's the deal", "here's the truth",
  'hits different', 'hits home', 'hits a wall', 'in a world', 'in the era of', "in today's era",
  "in today's modern age", "in today's world", 'in the world of', 'is all about', 'it is like',
  'lands well', 'mind blowing', 'miss the mark', 'moves the needle', 'perfect storm',
  'powerful tool', 'quiet acceptance', 'real deal', 'roll your eyes', 'scroll stopper', 'sea of',
  'secret sauce', 'secret weapon', 'saves the day', 'sneak peek', 'stay tuned',
  'scream into the void', 'welcome to the world', 'continuous improvement',
  'solution development', 'strategic alignment', 'operational excellence',
  'organizational efficiency',
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
    // Matches common variations too -- plurals, tense changes, and -er/-ity/-ful/-ly suffixes
    // (foster -> fostering/fosters/fostered, capture -> capturer/capturing, formidable -> n/a but
    // e.g. seamless -> seamlessly) -- per explicit request to catch "any variation" of a banned
    // word, not just the original 's'/'ed'/'ing' set.
    const re = new RegExp(`\\b${word}(?:s|es|ed|ing|er|ers|ity|ful|ly)?\\b`, 'gi');
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
