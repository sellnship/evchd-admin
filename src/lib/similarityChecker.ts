// Server-only. Shingle-based (8-word n-gram) overlap detection -- no AI call and no external
// plagiarism API (none is configured for this project; this reports NOT_CONFIGURED rather than
// inventing a score). Ported verbatim from gmadanew-inspect's similarityChecker.ts.

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function shingles(text: string, n = 8): Set<string> {
  const words = normalize(text).split(' ').filter(Boolean);
  const set = new Set<string>();
  for (let i = 0; i + n <= words.length; i++) set.add(words.slice(i, i + n).join(' '));
  return set;
}

interface OverlapMatch {
  shingle: string;
  against: string; // label for what it matched (source name or article title)
}

function findOverlap(draftShingles: Set<string>, otherText: string, label: string, limit: number): OverlapMatch[] {
  const other = shingles(otherText);
  const matches: OverlapMatch[] = [];
  for (const s of draftShingles) {
    if (other.has(s)) {
      matches.push({ shingle: s, against: label });
      if (matches.length >= limit) break;
    }
  }
  return matches;
}

export interface SimilarityResult {
  status: 'PASS' | 'REVIEW' | 'FAIL';
  sourceOverlap: OverlapMatch[];
  siteOverlap: OverlapMatch[];
  externalPlagiarism: { configured: false };
  manualReviewRequired: boolean;
}

/** `groundingText` is the same local-facts.json/models.json text buildGroundingContext() already
 * produces for the research stage -- source-overlap here is specifically catching verbatim
 * copying from that grounding data into the "written" article, which the humanize/fact-check
 * stages don't check for. `existingPosts` needs actual content (not just titles like
 * blogDedupe's candidates), for the site-overlap check. */
export function checkSimilarity(
  draftMarkdown: string,
  groundingText: string,
  existingPosts: { id: string; title: string; contentMarkdown: string }[],
): SimilarityResult {
  const draftShingles = shingles(draftMarkdown);

  const sourceOverlap = findOverlap(draftShingles, groundingText, 'grounding data', 10);
  const siteOverlap: OverlapMatch[] = [];
  for (const post of existingPosts) {
    const found = findOverlap(draftShingles, post.contentMarkdown, post.title, 5);
    siteOverlap.push(...found);
    if (siteOverlap.length >= 10) break;
  }

  const totalOverlap = sourceOverlap.length + siteOverlap.length;
  const status: SimilarityResult['status'] = totalOverlap >= 6 ? 'FAIL' : totalOverlap >= 2 ? 'REVIEW' : 'PASS';

  return {
    status,
    sourceOverlap: sourceOverlap.slice(0, 5),
    siteOverlap: siteOverlap.slice(0, 5),
    externalPlagiarism: { configured: false },
    manualReviewRequired: status !== 'PASS',
  };
}
