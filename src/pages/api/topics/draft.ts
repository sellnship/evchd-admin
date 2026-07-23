import type { APIRoute } from 'astro';
import { sql, logActivity } from '../../../lib/db';
import { complete } from '../../../lib/llm';

// "⚡ Draft with AI" — generate the article for ONE topic row (slug+lang)
// directly in the admin with the active LLM, and save it as a status='draft'
// article for review. This is the quick path; the "▶ Engine" path (GitHub
// Actions) runs the full gate pipeline + hero images instead.

function deriveDescription(body: string): string {
  const first = body
    .replace(/^#.*$/gm, '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith('-') && !p.startsWith('#'));
  const plain = (first || '').replace(/[*_`>#\[\]]/g, '').replace(/\s+/g, ' ').trim();
  return plain.length <= 158 ? plain : plain.slice(0, 155).replace(/\s+\S*$/, '') + '…';
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const slug = String(form.get('slug') ?? '').trim();
  const lang = String(form.get('lang') ?? 'en') === 'hi' ? 'hi' : 'en';
  const provider = String(form.get('provider') ?? '') || undefined;

  try {
    const q = sql();
    const topics = (await q`
      SELECT slug, lang, title, category, angle, image_prompt
      FROM topics WHERE slug = ${slug} AND lang = ${lang} AND status = 'pending'`) as any[];
    if (!topics.length) throw new Error(`no pending ${lang.toUpperCase()} topic "${slug}"`);
    const t = topics[0];

    const langRules =
      lang === 'hi'
        ? `Write NATIVELY in simple, conversational Hindi (Devanagari) — the everyday Hindi of Chandigarh/Mohali, keeping common English terms (scooter, battery, charging, RTO) in Latin script as people actually speak. Do NOT translate word-by-word from English.`
        : `Write in plain, direct English — grade-8 reading level, no jargon.`;

    const prompt = `Write a blog article for evchandigarh.in — an independent local site about LOW-SPEED electric scooters (seated step-through e-mopeds, ≤25 km/h, licence-free class) for the Chandigarh Tricity (Chandigarh, Mohali, Panchkula), India.

Title: ${t.title}
Category: ${t.category}
Editorial angle: ${t.angle || '(author’s judgment)'}

${langRules}

Hard rules:
- BRAND-NEUTRAL: never recommend or rank a specific brand/model. Compare by class and spec only. Prices as broad bands ("under ₹50,000"), never exact.
- No fabricated statistics, exact tariffs, or invented local claims. Where a number matters, use honest approximate ranges and say "check the latest".
- Local: written for Tricity readers (sectors, weather, RTO realities), not generic India content.
- 900–1200 words. Markdown. Start directly with the opening paragraph (NO H1 — the site adds the title). Use ## section headings. Short paragraphs. One practical takeaway list.
- End with a short honest conclusion — no marketing fluff, no CTA (the site adds one).

Reply with ONLY the article markdown.`;

    const body = (await complete(prompt, { maxTokens: 6000, provider }))
      .replace(/^```(?:markdown)?\s*/i, '')
      .replace(/```\s*$/, '')
      .replace(/^#\s.*$/m, '')
      .trim();
    if (body.length < 500) throw new Error('model returned a suspiciously short article — not saved');

    const description = deriveDescription(body);
    const tags = [t.category, 'low-speed', 'Tricity'].filter(Boolean);

    const rows = (await q`
      INSERT INTO articles (slug, lang, title, description, category, hero_image, tags, body_md, status, source)
      VALUES (${slug}, ${lang}, ${t.title}, ${description}, ${t.category}, '', ${tags}, ${body}, 'draft', 'ai')
      ON CONFLICT (slug, lang) DO UPDATE SET
        title = EXCLUDED.title, description = EXCLUDED.description, category = EXCLUDED.category,
        tags = EXCLUDED.tags, body_md = EXCLUDED.body_md, source = 'ai', updated_at = now()
      RETURNING id`) as { id: number }[];

    await q`UPDATE topics SET status = 'drafted', processed_at = now() WHERE slug = ${slug} AND lang = ${lang}`;
    await logActivity('article.drafted', { slug, lang, via: 'admin-llm' });

    // Straight into the editor: review, generate the hero, then publish.
    return redirect(`/blog/${rows[0].id}?saved=1`);
  } catch (e: any) {
    return redirect(`/generator?err=${encodeURIComponent(e?.message ?? 'draft failed')}`);
  }
};
