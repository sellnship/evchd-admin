import type { APIRoute } from 'astro';
import { putFile } from '../../../../lib/github';
import { logActivity } from '../../../../lib/db';

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const path = String(form.get('path') ?? '');
  const sha = String(form.get('sha') ?? '');
  const content = String(form.get('content') ?? '');

  try {
    if (!/^src\/content\/[\w\-/]+\.md$/.test(path)) throw new Error('invalid path');
    if (!sha) throw new Error('missing file sha');
    await putFile(path, content, sha, `content: edit ${path.split('/').pop()} via admin`);
    await logActivity('sitepage.commit', { path });
    return redirect('/admin/site-pages?committed=1');
  } catch (e: any) {
    return redirect(
      `/site-pages/edit?path=${encodeURIComponent(path)}&err=${encodeURIComponent(e?.message ?? 'commit failed')}`,
    );
  }
};
