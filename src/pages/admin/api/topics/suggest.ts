import type { APIRoute } from 'astro';
import { sql } from '../../../../lib/db';
import { complete, extractJSON, getActiveProvider } from '../../../../lib/llm';
import { getCategories } from '../../../../lib/categories';

// Suggest blog topics with the active LLM, seeded with (a) what's already
// published/queued — so suggestions don't duplicate — and (b) today's Google
// Trends (India) RSS when reachable, for timeliness. Returns JSON the
// generator page renders as "Use This" cards that autofill the topic form.

interface Suggestion {
  slug: string;
  title_en: string;
  title_hi: string;
  category: string;
  angle: string;
  image_prompt: string;
  why: string;
}

async function fetchTrends(): Promise<string[]> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch('https://trends.google.com/trending/rss?geo=IN', {
      signal: ctrl.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (evchd-admin)' },
    });
    clearTimeout(t);
    if (!res.ok) return [];
    const xml = await res.text();
    const titles = [...xml.matchAll(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/g)]
      .map((m) => m[1].trim())
      .filter((s) => s && !/Daily Search Trends/i.test(s));
    return titles.slice(0, 20);
  } catch {
    return []; // trends are optional inspiration — never block suggestions
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    // Optional provider override from the generator page's model dropdown.
    let provider: string | undefined;
    try { provider = (await request.json())?.provider; } catch { /* empty body is fine */ }

    const q = sql();
    const existing = (await q`
      SELECT slug, title FROM articles WHERE lang = 'en'
      UNION SELECT slug, title FROM topics WHERE lang = 'en'`) as { slug: string; title: string }[];
    const trends = await fetchTrends();
    const categories = await getCategories();

    const prompt = `You are the content strategist for evchandigarh.in — an independent, hyper-local site about LOW-SPEED electric scooters (seated step-through e-mopeds, ≤25 km/h, licence-free class) for the Chandigarh Tricity (Chandigarh, Mohali, Panchkula), India. Audience: first-time buyers, students, seniors, gig workers. Brand-neutral: never recommend a specific brand.

Existing articles/queued topics (do NOT suggest anything close to these):
${existing.map((e) => `- ${e.slug}: ${e.title}`).join('\n') || '(none yet)'}

${trends.length ? `Today's trending searches in India (use ONLY if genuinely relevant to EVs/mobility/energy/weather — ignore the rest):\n${trends.map((t) => `- ${t}`).join('\n')}` : ''}

Today's date: ${new Date().toISOString().slice(0, 10)} (consider season: monsoon Jun–Sep, winter smog Nov–Jan, summer heat Apr–Jun).

Suggest 5 blog topics. Reply with ONLY a JSON array, each item exactly:
{
  "slug": "kebab-case-url-slug",
  "title_en": "English title (search-intent phrased, ≤70 chars)",
  "title_hi": "Natural Hindi title (Devanagari, not a literal translation)",
  "category": "EXACTLY one of: ${categories.join(' | ')}",
  "angle": "2-3 sentences: the specific audience + the one question this answers + what makes it non-generic",
  "image_prompt": "one-sentence photographic SCENE for the hero image (no style words — the pipeline adds them)",
  "why": "one sentence on why this topic, right now"
}`;

    const raw = await complete(prompt, { maxTokens: 3000, provider });
    const suggestions = extractJSON<Suggestion[]>(raw);
    if (!Array.isArray(suggestions) || !suggestions.length) throw new Error('model returned no suggestions');

    return new Response(
      JSON.stringify({ provider: provider ?? (await getActiveProvider()), trends: trends.length > 0, suggestions }),
      { headers: { 'content-type': 'application/json' } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'suggestion failed' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
