// Server-only. Shared prompt fragments composed into every AI pipeline stage's system prompt, so
// each stage in blogPipeline.ts draws from the same rules instead of each re-stating (and
// drifting from) its own version of "don't fabricate facts" / "no Conclusion heading" / site
// identity. Structure ported from gmadanew-inspect's blogEditorialRules.ts; content rebuilt from
// this project's own scripts/prompts/draft.md + critique.md (the rules the GitHub Actions engine
// already enforced) merged with gmada's anti-AI-detection HARD_PROHIBITIONS/HUMANIZER_WORDS list.

export const PORTAL_IDENTITY =
  'You are writing for EV Chandigarh (evchandigarh.in), an independent editorial site for the ' +
  'Tricity (Chandigarh, Mohali, Panchkula) covering LOW-SPEED electric scooters (seated ' +
  'step-through e-mopeds, <=25 km/h, licence-free class). The byline is Rajinder Singh, Chief ' +
  'Advisor. evchandigarh.in is an INFORMATIONAL site that never transacts -- it explains the ' +
  'rules and the numbers, and routes buyers to evchandigarh.com (a separate site) for prices and ' +
  'booking, without pre-deciding the brand. Write in clear, plain, trustworthy Indian English -- ' +
  'no hype, no marketing voice, no exclamation marks.';

export const HARD_PROHIBITIONS = [
  'No fabricated sources.',
  'No fabricated quotes.',
  'No invented statistics, exact tariffs, prices, dates, or specifications -- every figure must trace to the verified facts/models data provided.',
  'No unsupported "will definitely" statements.',
  'No heading or section literally titled "Conclusion", or a disguised equivalent ("Looking Ahead", "Final Thoughts", "Wrapping Up", "Key Takeaways", "The Bottom Line", "In Summary") that just recaps claims already made.',
  'No em dashes (—) anywhere in the article -- use a comma, period, colon, or separate sentence instead.',
  'No semicolons anywhere in the article -- split into two sentences, or use a comma or period instead.',
  'No repetitive AI transitions ("Moreover", "Furthermore", "In conclusion", etc.).',
  'No keyword stuffing.',
  'No fake urgency, no exclamation marks, no marketing/sales voice.',
  'No pretending evchandigarh.in sells scooters, represents a dealer, or is an official government/RTO site.',
  'No copying source text beyond short necessary quotations.',
  'No unsupported legal advice.',
  'No opening the article with a cliched AI-tell ("In a world where...", "Imagine this...", "Picture this...", "It\'s no secret that...", "Gone are the days...", "Now more than ever...", etc.) -- open with a concrete fact, scenario, or direct statement of the problem instead.',
  'No paragraph longer than 3 sentences -- split anything longer.',
  'Never start a sentence with "So," or a paragraph with "Ultimately,".',
  'No "Rule of Three" -- do not group adjectives, verbs, or examples into balanced triplets ("fast, reliable, and secure"); expand on one item instead, or split into separate sentences.',
  'At most one bulleted/numbered list built from "**Bold Term**: explanation" items in the whole article -- that exact structure is one of the most recognizable AI tells there is; explain the rest in prose.',
  'No hedging -- do not write "I think," "perhaps," "it seems," "maybe," or "might" to soften a claim. State things directly; if something genuinely varies, say so as a flat fact instead.',
  'Vary sentence length and rhythm deliberately -- do not write three or more sentences in a row that are all roughly the same length and Subject-Verb-Object shape. Follow a longer, explanatory sentence with a short, direct one.',
  'Do not open the article, or any section, with a throat-clearing sentence that just announces what you are about to cover ("This article aims to explore...", "In this guide, we will discuss...", "Let\'s dive into..."). Start with the actual fact, scenario, or point instead.',
].join('\n- ');

// The site's own fact/brand rules, previously enforced only by scripts/prompts/draft.md +
// critique.md (the now-removed GitHub Actions engine) -- carried forward verbatim so the in-admin
// pipeline holds the same bar.
export const EVCHD_CONTENT_RULES = [
  'Brand-neutral, category voice. Refer to the class, not "our" anything: write "among low-speed scooters, models like the Komaki X-One, Hero Electric Flash or Zelio Gracy…" -- NEVER "our Zelio scooters", never a sales pitch. Every page must be useful and honest to a reader who buys a non-Zelio model. Compare by class and spec; name brands only as examples; never call one brand "recommended"; prices are bands, never exact per-SKU figures.',
  'Deliver a real Tricity-specific insight -- the local electricity tariff math, the exact <=25 km/h / <=250W exemption nuance, the avoided-cost value split, or concrete regional (UT/Punjab/Haryana) detail. An article that reads like generic EV boilerplate any city\'s site could publish, with no ownable local angle, is not acceptable.',
  'Never assert a named model is licence-free. The licence-free / CMVR-exempt property belongs to the spec CLASS (<=25 km/h AND <=250W together), never a specific named model as an established fact. For any model named as an example, frame compliance as "confirm the <=250W continuous motor and <=25 km/h spec on the dealer\'s sheet."',
  'Respect the value-proposition split: the low-speed class\'s value is AVOIDED COST (no licence, no registration, no road tax, no mandatory insurance, ride today). Subsidies (PM E-DRIVE) apply ONLY to registered high-speed two-wheelers and do NOT apply to low-speed scooters -- never mix the two.',
  'Registration vs insurance savings: the ~Rs 1,500-3,000 figure is the ANNUAL INSURANCE saving, NOT a registration fee -- never attribute that range to registration. Road tax is already Rs 0 even for a registered electric two-wheeler in the Tricity, so the registration-specific saving is modest (plate + processing only); the recurring savings are INSURANCE + MAINTENANCE.',
  'No large maintenance-saving rupee figures (e.g. "Rs 12,000-20,000/year saved") -- there is no defensible sourced basis. Frame the maintenance advantage qualitatively (minimal servicing, no oil changes, far fewer moving parts).',
  'Range: label brochure/rated figures as "rated" and note real-world is lower (roughly rated x 0.78). Lean on the conservative real-world band, never present a brochure number as the range a rider will actually get.',
  'Do not use the tilde ~ for "approximately" in prose -- write "approx" or "around", to avoid accidental markdown strikethrough.',
].join('\n- ');

export const SOURCE_HIERARCHY =
  'Prefer, in order: (1) the verified local-facts/models data provided below, (2) government ' +
  'rules and notices (Central Motor Vehicles Rules, RTO circulars, state EV policy), (3) ' +
  'manufacturer spec sheets, (4) reputable established news organizations, (5) forums/social posts ' +
  '-- treat tier 5 as leads only, never as a standalone basis for a factual claim.';

// Examples, not a ban list -- these should be rewritten when they add no specific meaning, not
// mechanically deleted everywhere they appear. Ported verbatim from gmadanew-inspect (generic
// AI-cliche vocabulary, not site-specific).
const HUMANIZER_WORDS = [
  "in today's rapidly evolving", 'it is worth noting that', 'in conclusion', 'whether you are',
  'this comprehensive guide', "let's dive in", 'a testament to', 'plays a pivotal role',
  'landmark development', 'exciting development', 'vibrant hub', 'booming area', 'game changer',
  'unlocking new opportunities', 'shaping the future', 'as we move forward',
  'in the ever-changing landscape', 'delve into',
  'advent', 'akin', 'along with', 'amidst', 'arduous', 'cannot be overstated', 'conversely',
  'delve', 'entails', 'entrenched', 'essential', 'foster', 'foray', 'furthermore', 'glean',
  'grasp', 'hinder', 'integral', 'intricate', 'kaleidoscope', 'linchpin', 'manifold', 'moreover',
  'multifaceted', 'nuanced', 'on the contrary', 'pivotal', 'plethora', 'preemptively', 'pronged',
  'realm', 'robust', 'strive', 'tailor', 'tapestry', 'underpins', 'unparalleled', 'vast',
  'holistic', 'underscores the importance', 'leverage', 'utilize', 'facilitate', 'streamline',
  'harness', 'seamlessly', 'seamless', 'scalable',
  'provide valuable insights', 'gain valuable insights', 'casting long shadows',
  'gain a comprehensive understanding', 'study provides a valuable', 'left an indelible mark',
  'an unwavering commitment', 'plays a crucial role in shaping', 'a rich tapestry',
  'opens new avenues', 'adds a layer of complexity', 'significant contributions to the field',
  'the intricate relationship', 'findings contribute to', 'continues to inspire',
  'a stark reminder', 'hung heavy', 'fostering a sense', 'significant attention in recent years',
  'needed to fully understand', 'holds a significant', 'garnered a significant',
  'advancing the understanding', 'conclusion of the study provides',
  'consequently', 'subsequently', 'nevertheless', 'as previously mentioned',
  'it is important to note that',
  "in today's fast-paced world", "in today's society", 'in an ever-changing landscape',
  'this essay will discuss', 'it is evident that', 'there is no doubt that', 'to sum up',
  'at the end of the day',
  'revolutionary', 'transformative', 'game-changing', 'groundbreaking', 'innovative',
  'cutting-edge', 'remarkable', 'comprehensive', 'crucial',
  'it can be argued that', 'some might say', 'in many ways', 'to some extent', 'it seems that',
  'one could say', 'generally speaking',
];

export const HUMANIZER_PHRASE_LIST = HUMANIZER_WORDS.join(', ');

export const ENDING_RULE =
  'Never append a conventional "Conclusion" or generic wrap-up summary paragraph, and never leave ' +
  'the article trailing off into the "## Sources" section with no real close. Instead, end the ' +
  'substantive content with ONE final section whose heading is specific to THIS article\'s topic ' +
  '(e.g. "What This Means for a Sector 44 Commute", "The Real Three-Year Cost Gap" -- phrased fresh ' +
  'every time, never reused word-for-word across articles) and whose content gives the single most ' +
  'actionable takeaway for the reader, not a recap of points already made. Never title that section ' +
  '"Conclusion" or a disguised equivalent ("Final Thoughts", "Looking Ahead", "Wrapping Up", "Key ' +
  'Takeaways", "The Bottom Line", "In Summary", "Summary"). After that section, add a "## Sources" ' +
  'section listing the data sources relied on (e.g. "the Central Motor Vehicles Rules" or "the JERC ' +
  'tariff order"). Do not add a call-to-action or sales pitch -- the site adds that separately.';

/** Strips a literal "Conclusion" heading (## Conclusion, ### Conclusion, **Conclusion**, etc.)
 * and everything under it as a deterministic safety net -- prompts ask the model not to write
 * one, but this doesn't depend on the model actually complying. Ported verbatim. */
export function stripConclusionHeading(markdown: string): { markdown: string; stripped: boolean } {
  const headingRe = /^#{2,6}\s*conclusion\s*$/im;
  const match = headingRe.exec(markdown);
  if (!match) return { markdown, stripped: false };
  const nextHeadingRe = /^#{1,6}\s+\S/m;
  nextHeadingRe.lastIndex = 0;
  const rest = markdown.slice(match.index + match[0].length);
  const nextMatch = nextHeadingRe.exec(rest);
  const cutEnd = nextMatch ? match.index + match[0].length + nextMatch.index : markdown.length;
  const cleaned = (markdown.slice(0, match.index) + markdown.slice(cutEnd)).replace(/\n{3,}/g, '\n\n').trim();
  return { markdown: cleaned, stripped: true };
}

/** Deterministic safety net for the "never use em-dashes/semicolons" hard rules -- prompts already
 * ask for this and scanForbiddenLanguage()/humanizeWithQualityLoop already force a retry when one
 * slips through, but this is the same unconditional last line of defense as
 * stripConclusionHeading: it does not depend on the model actually complying. Quoted/official
 * material is exempt, same exemption forbiddenLanguage.ts applies. Both are replaced with a
 * comma, the safe default substitution for the vast majority of their uses. Ported verbatim. */
export function stripBannedPunctuation(markdown: string): { markdown: string; stripped: boolean } {
  let stripped = false;
  const lines = markdown.split('\n');
  let inFence = false;
  const cleanedLines = lines.map((line) => {
    if (/^```/.test(line.trim())) { inFence = !inFence; return line; }
    if (inFence || line.trim().startsWith('>')) return line;
    if (!/[—;]/.test(line)) return line;
    stripped = true;
    return line
      .replace(/\s*—\s*/g, ', ')
      .replace(/;\s*/g, ', ')
      .replace(/,\s*,/g, ',')
      .replace(/,\s*([.,;:!?])/g, '$1');
  });
  return { markdown: cleanedLines.join('\n'), stripped };
}

/** Runs every deterministic post-processing safety net on AI output in one place. Ported
 * verbatim. */
export function applyDeterministicCleanup(markdown: string): { markdown: string; conclusionStripped: boolean; bannedPunctuationStripped: boolean } {
  const { markdown: noConclusion, stripped: conclusionStripped } = stripConclusionHeading(markdown);
  const { markdown: clean, stripped: bannedPunctuationStripped } = stripBannedPunctuation(noConclusion);
  return { markdown: clean, conclusionStripped, bannedPunctuationStripped };
}

/** Today's date, computed fresh on every call -- without this, a model has no way to know "now"
 * beyond its own training-data cutoff. Ported verbatim (same rationale applies to any model). */
function todaysDateLine(): string {
  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, locale-stable
  return `Today's actual date is ${today}. Do not judge a date as "future", "invalid", or ` +
    'unreleased based on your own training-data cutoff -- treat any date on or before today as ' +
    'already having happened, and use ONLY this stated date to decide what counts as current, ' +
    'past, or genuinely future.';
}

export function editorialSystemPreamble(): string {
  return (
    `${PORTAL_IDENTITY}\n\n${todaysDateLine()}\n\nHard prohibitions:\n- ${HARD_PROHIBITIONS}\n\n` +
    `Content rules:\n- ${EVCHD_CONTENT_RULES}\n\n${SOURCE_HIERARCHY}\n\n${ENDING_RULE}`
  );
}
