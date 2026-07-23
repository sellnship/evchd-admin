import type { APIRoute } from 'astro';
import { setSetting } from '../../../lib/settings';
import { logActivity } from '../../../lib/db';
import { PROVIDERS, IMAGE_MODELS } from '../../../lib/llm';

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const changed: string[] = [];

  const save = async (key: string, value: string) => {
    await setSetting(key, value);
    changed.push(key);
  };

  // Provider keys: blank = keep existing (never clears). Models: always saved.
  for (const p of PROVIDERS) {
    const key = String(form.get(`llm_${p.id}_key`) ?? '').trim();
    if (key) await save(`llm_${p.id}_key`, key);
    const model = String(form.get(`llm_${p.id}_model`) ?? '').trim();
    if (model) await save(`llm_${p.id}_model`, model);
  }

  const falKey = String(form.get('llm_fal_key') ?? '').trim();
  if (falKey) await save('llm_fal_key', falKey);

  const imageModel = String(form.get('image_model') ?? '').trim();
  if (IMAGE_MODELS.some((m) => m.id === imageModel)) await save('image_model', imageModel);

  const active = String(form.get('llm_active_provider') ?? '').trim();
  if (PROVIDERS.some((p) => p.id === active)) await save('llm_active_provider', active);

  const hook = form.get('deploy_hook_url');
  if (hook !== null) await save('deploy_hook_url', String(hook).trim());

  // Log key NAMES only — never values.
  await logActivity('settings.update', { keys: changed.filter((k) => !k.endsWith('_key')) });
  return redirect('/settings?ok=1');
};
