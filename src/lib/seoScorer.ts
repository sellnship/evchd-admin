// Server-only. Deterministic on-page SEO score -- complements seoOptimize() (an AI call that
// writes the title/description/keyword *copy*) by objectively scoring the *result* the same way
// aiPatternChecker.ts scores humanization: no AI call, instant, can't hallucinate a number. Runs
// automatically in the review stage and on demand for already-saved articles. Ported verbatim
// from gmadanew-inspect's seoScorer.ts (no site-specific content to adapt here).

export interface SeoScoreResult {
  score: number; // 0-100
  flags: string[];
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function scoreSeo(input: {
  title: string;
  seoTitle?: string;
  seoDescription?: string;
  contentMarkdown: string;
  keywords?: string[];
  focusKeyword?: string;
  imageAlt?: string;
  internalLinkCount?: number;
}): SeoScoreResult {
  const flags: string[] = [];
  let deductions = 0;

  const seoTitle = input.seoTitle || input.title;
  if (seoTitle.length < 30 || seoTitle.length > 65) {
    deductions += 10;
    flags.push(`SEO title is ${seoTitle.length} characters (aim for 30-65)`);
  }

  const desc = input.seoDescription || '';
  if (!desc) {
    deductions += 15;
    flags.push('No meta description set');
  } else if (desc.length < 110 || desc.length > 165) {
    deductions += 8;
    flags.push(`Meta description is ${desc.length} characters (aim for 110-165)`);
  }

  const headingCount = (input.contentMarkdown.match(/^#{2,3}\s+/gm) || []).length;
  if (headingCount === 0) {
    deductions += 10;
    flags.push('No subheadings (##/###) -- harder to scan and less useful for search snippets');
  }

  const focus = (input.focusKeyword || input.keywords?.[0] || '').toLowerCase().trim();
  if (focus) {
    const titleLower = seoTitle.toLowerCase();
    const firstProseBlock = input.contentMarkdown.split(/\n{2,}/).find((block) => !/^#{1,6}\s/.test(block.trim())) || '';
    const firstPara = firstProseBlock.toLowerCase();
    if (!titleLower.includes(focus)) {
      deductions += 10;
      flags.push(`Focus keyword "${focus}" not present in the SEO title`);
    }
    if (!firstPara.includes(focus)) {
      deductions += 6;
      flags.push(`Focus keyword "${focus}" not present in the opening paragraph`);
    }
  }

  if (!input.imageAlt) {
    deductions += 8;
    flags.push('Cover image has no alt text');
  }

  if (!input.internalLinkCount) {
    deductions += 8;
    flags.push('No internal links in the article body');
  }

  const words = wordCount(input.contentMarkdown);
  if (words < 400) {
    deductions += 10;
    flags.push(`Article is short (${words} words) -- thin content ranks less reliably`);
  }

  return { score: Math.max(0, 100 - deductions), flags };
}
