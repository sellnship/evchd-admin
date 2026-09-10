// Server-only. Deterministic title-similarity dedup check — no embeddings/semantic-similarity
// API wired into this project, so word-overlap similarity is a reasonable proxy at this blog's
// scale (dozens, not thousands, of posts). Ported from gmadanew-inspect's blogDedupe.ts (same
// pipeline shape, no site-specific content to adapt here).

const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'is', 'are', 'was', 'were',
  'be', 'by', 'with', 'from', 'as', 'that', 'this', 'it', 'its', 'about', 'into',
]);

function normalizeWords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w && !STOPWORDS.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface DedupeCandidate {
  id: string;
  title: string;
  slug: string;
}

export interface DedupeMatch extends DedupeCandidate {
  similarity: number;
}

export type DedupeVerdict = 'DUPLICATE' | 'MANUAL_REVIEW' | 'DISTINCT';

export interface DedupeResult {
  verdict: DedupeVerdict;
  matches: DedupeMatch[];
}

/** Compares `title` against every existing article's title. Exact (case/punctuation-insensitive)
 * title match short-circuits to DUPLICATE at similarity 1. Otherwise scores every candidate by
 * word-overlap and returns the ranked matches above a noise floor, with a verdict driven by the
 * best match: >=0.9 DUPLICATE, 0.6-0.89 MANUAL_REVIEW, otherwise DISTINCT. */
export function checkDuplicate(title: string, existingPosts: DedupeCandidate[]): DedupeResult {
  const targetWords = normalizeWords(title);
  const targetNormalized = title.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');

  const matches: DedupeMatch[] = existingPosts
    .map((post) => {
      const postNormalized = post.title.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
      const similarity = postNormalized === targetNormalized ? 1 : jaccard(targetWords, normalizeWords(post.title));
      return { ...post, similarity };
    })
    .filter((m) => m.similarity >= 0.4)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);

  const best = matches[0]?.similarity ?? 0;
  const verdict: DedupeVerdict = best >= 0.9 ? 'DUPLICATE' : best >= 0.6 ? 'MANUAL_REVIEW' : 'DISTINCT';

  return { verdict, matches };
}
