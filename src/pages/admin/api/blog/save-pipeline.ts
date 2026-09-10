import type { APIRoute } from 'astro';
export const prerender = false;
import { sql, logActivity } from '../../../../lib/db';
import { getSetting } from '../../../../lib/settings';

// Dedicated JSON-in/JSON-out save endpoint for the AI pipeline UI (admin/blog/ai.astro), separate
// from api/blog/save.ts (which stays a classic multipart-form/redirect endpoint for the manual
// editor at blog/[id].astro) so neither caller's contract has to bend to fit the other. This is
// the only place the pipeline's audit trail (research/fact-check/SEO/editorial-review reports)
// gets written -- every field is optional and COALESCEd against the existing row on update, so a
// later plain re-save (e.g. from the manual editor) never wipes out a previously-generated report.

interface SavePipelineBody {
  id?: number | string;
  slug: string;
  lang: 'en' | 'hi';
  title: string;
  excerpt?: string;
  category: string;
  tags?: string[];
  bodyMarkdown: string;
  status: 'draft' | 'published';
  heroImageUrl?: string;
  imagePrompt?: string;
  imageAlt?: string;
  imageCaption?: string;
  imageStatus?: string;
  research?: unknown;
  duplicateCheck?: unknown;
  factCheck?: unknown;
  seoReport?: unknown;
  aiSearchReport?: unknown;
  editorialReview?: unknown;
  aiPatternCheck?: unknown;
  similarity?: unknown;
  internalLinks?: unknown;
  estimatedCostUsd?: number;
}

async function fireDeployHook() {
  const hook = await getSetting('deploy_hook_url');
  if (!hook) return;
  await fetch(hook, { method: 'POST' }).catch(() => {});
}

export const POST: APIRoute = async ({ request }) => {
  let body: SavePipelineBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON body' }), { status: 400 });
  }

  const slug = (body.slug ?? '').trim().toLowerCase();
  const lang = body.lang === 'hi' ? 'hi' : 'en';
  const title = (body.title ?? '').trim();
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return new Response(JSON.stringify({ error: 'slug must be lowercase letters/digits/hyphens' }), { status: 400 });
  }
  if (!title) return new Response(JSON.stringify({ error: 'title is required' }), { status: 400 });

  const j = (v: unknown) => (v === undefined ? null : JSON.stringify(v));

  try {
    const q = sql();
    const rows = (await q`
      INSERT INTO articles (
        slug, lang, title, description, category, hero_image, tags, body_md, status, source,
        research_json, duplicate_check_json, fact_check_json, seo_report_json, ai_search_report_json,
        editorial_review_json, ai_pattern_check_json, similarity_json, internal_links_json,
        estimated_cost_usd, image_prompt, image_alt, image_caption, image_status,
        date_published
      )
      VALUES (
        ${slug}, ${lang}, ${title}, ${body.excerpt ?? ''}, ${body.category ?? ''},
        ${body.heroImageUrl ?? ''}, ${body.tags ?? []}, ${body.bodyMarkdown ?? ''},
        ${body.status === 'published' ? 'published' : 'draft'}, 'ai',
        ${j(body.research)}::jsonb, ${j(body.duplicateCheck)}::jsonb, ${j(body.factCheck)}::jsonb,
        ${j(body.seoReport)}::jsonb, ${j(body.aiSearchReport)}::jsonb, ${j(body.editorialReview)}::jsonb,
        ${j(body.aiPatternCheck)}::jsonb, ${j(body.similarity)}::jsonb, ${j(body.internalLinks)}::jsonb,
        ${body.estimatedCostUsd ?? null}, ${body.imagePrompt ?? null}, ${body.imageAlt ?? null},
        ${body.imageCaption ?? null}, ${body.imageStatus ?? null},
        ${body.status === 'published' ? new Date().toISOString() : null}
      )
      ON CONFLICT (slug, lang) DO UPDATE SET
        title = EXCLUDED.title,
        description = COALESCE(NULLIF(EXCLUDED.description, ''), articles.description),
        category = COALESCE(NULLIF(EXCLUDED.category, ''), articles.category),
        hero_image = COALESCE(NULLIF(EXCLUDED.hero_image, ''), articles.hero_image),
        tags = EXCLUDED.tags,
        body_md = EXCLUDED.body_md,
        status = EXCLUDED.status,
        research_json = COALESCE(EXCLUDED.research_json, articles.research_json),
        duplicate_check_json = COALESCE(EXCLUDED.duplicate_check_json, articles.duplicate_check_json),
        fact_check_json = COALESCE(EXCLUDED.fact_check_json, articles.fact_check_json),
        seo_report_json = COALESCE(EXCLUDED.seo_report_json, articles.seo_report_json),
        ai_search_report_json = COALESCE(EXCLUDED.ai_search_report_json, articles.ai_search_report_json),
        editorial_review_json = COALESCE(EXCLUDED.editorial_review_json, articles.editorial_review_json),
        ai_pattern_check_json = COALESCE(EXCLUDED.ai_pattern_check_json, articles.ai_pattern_check_json),
        similarity_json = COALESCE(EXCLUDED.similarity_json, articles.similarity_json),
        internal_links_json = COALESCE(EXCLUDED.internal_links_json, articles.internal_links_json),
        estimated_cost_usd = COALESCE(EXCLUDED.estimated_cost_usd, articles.estimated_cost_usd),
        image_prompt = COALESCE(EXCLUDED.image_prompt, articles.image_prompt),
        image_alt = COALESCE(EXCLUDED.image_alt, articles.image_alt),
        image_caption = COALESCE(EXCLUDED.image_caption, articles.image_caption),
        image_status = COALESCE(EXCLUDED.image_status, articles.image_status),
        date_published = COALESCE(articles.date_published, EXCLUDED.date_published),
        date_modified = now(), updated_at = now()
      RETURNING id`) as { id: number }[];

    const articleId = rows[0].id;
    await logActivity(body.status === 'published' ? 'article.publish' : 'article.save', { slug, lang, via: 'ai-pipeline' });
    if (body.status === 'published') await fireDeployHook();

    return new Response(JSON.stringify({ id: articleId, slug, lang }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'save failed' }), { status: 500 });
  }
};
