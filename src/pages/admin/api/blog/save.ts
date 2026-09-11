import type { APIRoute } from 'astro';
export const prerender = false;
import sharp from 'sharp';
import { put } from '@vercel/blob';
import { sql, logActivity } from '../../../../lib/db';
import { getSetting } from '../../../../lib/settings';

const HERO_W = 1200, HERO_H = 675, WEBP_QUALITY = 82;

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const id = String(form.get('id') ?? '');
  const action = String(form.get('action') ?? 'save'); // save | publish | unpublish
  const slug = String(form.get('slug') ?? '').trim().toLowerCase();
  const lang = String(form.get('lang') ?? 'en') === 'hi' ? 'hi' : 'en';
  const title = String(form.get('title') ?? '').trim();
  const description = String(form.get('description') ?? '').trim();
  const category = String(form.get('category') ?? '').trim();
  const author = String(form.get('author') ?? '').trim();
  const reviewed_by = String(form.get('reviewed_by') ?? '').trim();
  const body_md = String(form.get('body_md') ?? '');
  // Populated only when the manual editor's Fact Check / SEO Check tools were run
  // (see blog/[id].astro) -- COALESCEd against the existing row below so a plain
  // save that never touched those tools doesn't wipe out an AI pipeline's report.
  const factCheckJson = String(form.get('fact_check_json') ?? '').trim();
  const seoReportJson = String(form.get('seo_report_json') ?? '').trim();
  // The EN/HI counterpart's hero, offered as a default in blog/[id].astro when
  // this article doesn't have its own yet -- only actually applied here if
  // nothing else (a fresh upload, or an already-saved hero) takes priority.
  const inheritedHeroImage = String(form.get('inherited_hero_image') ?? '').trim();
  const tags = String(form.get('tags') ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const back = (aid: string, qs: string) => redirect(`/admin/blog/${aid}?${qs}`);

  try {
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) throw new Error('slug must be lowercase letters/digits/hyphens');
    if (!title) throw new Error('title is required');

    // Optional hero upload → 1200×675 WebP on Vercel Blob (same spec as the engine).
    let heroUrl: string | null = null;
    const hero = form.get('hero');
    if (hero instanceof File && hero.size > 0) {
      const buf = Buffer.from(await hero.arrayBuffer());
      const webp = await sharp(buf)
        .resize(HERO_W, HERO_H, { fit: 'cover', position: 'centre' })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
      const heroSlug = lang === 'hi' ? `${slug}-hi` : slug;
      const blob = await put(`blog/${heroSlug}-hero.webp`, webp, {
        access: 'public',
        contentType: 'image/webp',
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      heroUrl = blob.url;
    }

    const q = sql();
    let articleId = id;

    if (id) {
      await q`
        UPDATE articles SET
          title = ${title}, description = ${description}, category = ${category},
          author = COALESCE(NULLIF(${author}, ''), author),
          reviewed_by = COALESCE(NULLIF(${reviewed_by}, ''), reviewed_by),
          tags = ${tags}, body_md = ${body_md},
          hero_image = COALESCE(${heroUrl}, NULLIF(hero_image, ''), NULLIF(${inheritedHeroImage}, '')),
          fact_check_json = COALESCE(NULLIF(${factCheckJson}, '')::jsonb, fact_check_json),
          seo_report_json = COALESCE(NULLIF(${seoReportJson}, '')::jsonb, seo_report_json),
          date_modified = now(), updated_at = now()
        WHERE id = ${Number(id)}`;
    } else {
      const rows = (await q`
        INSERT INTO articles (slug, lang, title, description, category, hero_image, author, reviewed_by, tags, body_md, status, source, fact_check_json, seo_report_json)
        VALUES (${slug}, ${lang}, ${title}, ${description}, ${category}, ${heroUrl ?? inheritedHeroImage ?? ''}, ${author || 'rajinder-singh'}, ${reviewed_by || 'rajinder-singh'}, ${tags}, ${body_md}, 'draft', 'manual', ${factCheckJson || null}::jsonb, ${seoReportJson || null}::jsonb)
        ON CONFLICT (slug, lang) DO UPDATE SET
          title = EXCLUDED.title, description = EXCLUDED.description, category = EXCLUDED.category,
          hero_image = COALESCE(NULLIF(EXCLUDED.hero_image, ''), articles.hero_image),
          author = COALESCE(NULLIF(EXCLUDED.author, ''), articles.author),
          reviewed_by = COALESCE(NULLIF(EXCLUDED.reviewed_by, ''), articles.reviewed_by),
          fact_check_json = COALESCE(EXCLUDED.fact_check_json, articles.fact_check_json),
          seo_report_json = COALESCE(EXCLUDED.seo_report_json, articles.seo_report_json),
          tags = EXCLUDED.tags, body_md = EXCLUDED.body_md, updated_at = now()
        RETURNING id`) as { id: number }[];
      articleId = String(rows[0].id);
      await logActivity('article.create', { slug, lang });
    }

    if (action === 'publish') {
      await q`
        UPDATE articles SET status = 'published',
          date_published = COALESCE(date_published, now()), updated_at = now()
        WHERE id = ${Number(articleId)}`;
      await logActivity('article.publish', { slug, lang });
      await fireDeployHook();
    } else if (action === 'unpublish') {
      await q`UPDATE articles SET status = 'draft', updated_at = now() WHERE id = ${Number(articleId)}`;
      await logActivity('article.unpublish', { slug, lang });
      await fireDeployHook();
    } else {
      // Plain "save" on an ALREADY-published article -- its live content just
      // changed (title/description/body/hero/etc.), so the site needs a
      // rebuild too, not just on the draft<->published transition. Otherwise
      // an edit to a published article silently never reaches the live site
      // until some unrelated publish/unpublish elsewhere happens to trigger one.
      const rows = (await q`SELECT status FROM articles WHERE id = ${Number(articleId)}`) as { status: string }[];
      if (rows[0]?.status === 'published') await fireDeployHook();
    }

    return back(articleId, 'saved=1');
  } catch (e: any) {
    const target = id || 'new';
    return back(target, `err=${encodeURIComponent(e?.message ?? 'unknown error')}`);
  }
};

async function fireDeployHook() {
  const hook = await getSetting('deploy_hook_url');
  if (!hook) return; // not configured yet — publish still works, site rebuilds on next deploy
  await fetch(hook, { method: 'POST' }).catch(() => {});
}
