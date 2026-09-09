import type { APIRoute } from 'astro';
export const prerender = false;
import { sql, logActivity } from '../../../../lib/db';
import { dispatchBlogWorkflow } from '../../../../lib/github';

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const slug = String(form.get('slug') ?? '').trim();

  try {
    const rows = (await sql()`
      SELECT count(*)::int AS n FROM topics WHERE slug = ${slug} AND status = 'pending'`) as { n: number }[];
    if (!rows[0]?.n) throw new Error(`no pending topic "${slug}"`);

    await dispatchBlogWorkflow(slug);
    await logActivity('topic.dispatch', { slug });
    return redirect(`/admin/generator?ok=${encodeURIComponent(`Engine dispatched for "${slug}" — drafts appear in a few minutes.`)}`);
  } catch (e: any) {
    return redirect(`/admin/generator?err=${encodeURIComponent(e?.message ?? 'dispatch failed')}`);
  }
};
