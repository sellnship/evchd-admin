import type { APIRoute } from 'astro';
import { setSetting } from '../../../lib/settings';
import { logActivity } from '../../../lib/db';

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const hook = String(form.get('deploy_hook_url') ?? '').trim();
  await setSetting('deploy_hook_url', hook);
  await logActivity('settings.update', { key: 'deploy_hook_url' });
  return redirect('/settings?ok=1');
};
