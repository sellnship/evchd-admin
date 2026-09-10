import type { APIRoute } from 'astro';
export const prerender = false;
import { marked } from 'marked';

// Renders the current editor fields to HTML for the "Preview Article" modal in
// admin/blog/ai.astro -- no DB write, just a render.
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const title = String(body.title || '').trim();
  const category = String(body.category || '').trim();
  const tags: string[] = Array.isArray(body.tags) ? body.tags : [];
  const coverImageUrl = String(body.coverImageUrl || '').trim();
  const contentMarkdown = String(body.contentMarkdown || '');

  const bodyHtml = marked.parse(contentMarkdown, { async: false }) as string;
  const html = `
    <article class="preview-article">
      ${coverImageUrl ? `<img src="${escapeAttr(coverImageUrl)}" alt="${escapeAttr(title)}" style="width:100%;border-radius:8px;margin-bottom:1rem;" />` : ''}
      ${category ? `<div class="text-secondary small mb-1">${escapeHtml(category)}</div>` : ''}
      <h1>${escapeHtml(title)}</h1>
      ${tags.length ? `<div class="mb-3">${tags.map((t) => `<span class="badge status-pending me-1">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
      <div class="preview-body">${bodyHtml}</div>
    </article>`;

  return new Response(JSON.stringify({ html }), { headers: { 'Content-Type': 'application/json' } });
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
