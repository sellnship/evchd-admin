// Unified LLM + image-model access for the admin's AI features (topic
// suggestions, hero generation). Keys/models are managed on the Settings page
// (stored in the `settings` table, write-only in the UI) with env-var fallback.
//
// NOTE: these keys power ADMIN-side AI only. The article-drafting engine runs
// in GitHub Actions and reads its keys from repository secrets — unchanged.
import Anthropic from '@anthropic-ai/sdk';
import { getSetting } from './settings';
import { env } from './env';

// ── Text providers ──────────────────────────────────────────────────────────

export interface Provider {
  id: string;
  label: string;
  defaultModel: string;
  keyHint: string; // where to get a key
  envVar?: string; // optional env fallback for the key
}

export const PROVIDERS: Provider[] = [
  { id: 'anthropic', label: 'Anthropic (Claude)', defaultModel: 'claude-opus-4-8', keyHint: 'console.anthropic.com → API Keys', envVar: 'ANTHROPIC_API_KEY' },
  { id: 'openai', label: 'OpenAI', defaultModel: 'gpt-4o', keyHint: 'platform.openai.com → API Keys', envVar: 'OPENAI_API_KEY' },
  { id: 'groq', label: 'Groq', defaultModel: 'llama-3.3-70b-versatile', keyHint: 'console.groq.com → API Keys', envVar: 'GROQ_API_KEY' },
  { id: 'gemini', label: 'Google Gemini', defaultModel: 'gemini-2.5-flash', keyHint: 'aistudio.google.com → Get API Key', envVar: 'GEMINI_API_KEY' },
  { id: 'xai', label: 'Grok (xAI)', defaultModel: 'grok-3', keyHint: 'console.x.ai → API Keys', envVar: 'XAI_API_KEY' },
  { id: 'edenai', label: 'Eden AI (aggregator)', defaultModel: 'openai/gpt-4o', keyHint: 'app.edenai.run → API keys — model format: provider/model', envVar: 'EDENAI_API_KEY' },
];

export async function getProviderKey(id: string): Promise<string> {
  const stored = await getSetting(`llm_${id}_key`);
  if (stored) return stored;
  const p = PROVIDERS.find((x) => x.id === id);
  return p?.envVar ? env(p.envVar) : '';
}

export async function getProviderModel(id: string): Promise<string> {
  const stored = await getSetting(`llm_${id}_model`);
  if (stored) return stored;
  return PROVIDERS.find((x) => x.id === id)?.defaultModel ?? '';
}

/** Providers that actually have a key, in quality order, with their model. */
export async function getConfiguredProviders(): Promise<(Provider & { model: string })[]> {
  const out: (Provider & { model: string })[] = [];
  for (const p of PROVIDERS) {
    if (await getProviderKey(p.id)) out.push({ ...p, model: await getProviderModel(p.id) });
  }
  return out;
}

/** The provider used for admin-side text generation. Falls back to the BEST
 *  configured provider (PROVIDERS order) when the stored choice has no key —
 *  so adding your first key immediately enables the AI buttons. */
export async function getActiveProvider(): Promise<string> {
  const stored = (await getSetting('llm_active_provider')) || 'anthropic';
  if (await getProviderKey(stored)) return stored;
  const configured = await getConfiguredProviders();
  return configured[0]?.id ?? stored;
}

/** Turn a provider HTTP failure into a message a human can act on. */
function apiError(providerId: string, status: number, body: string): Error {
  let detail = '';
  try {
    const j = JSON.parse(body);
    detail = j?.error?.message ?? j?.message ?? '';
  } catch {
    detail = body;
  }
  detail = String(detail).split('\n')[0].slice(0, 180);
  const label = PROVIDERS.find((p) => p.id === providerId)?.label ?? providerId;

  let msg: string;
  if (status === 429) {
    const retry = body.match(/retry in ([\d.]+)s/i)?.[1];
    msg = /free[_ ]?tier|limit: 0/i.test(body)
      ? `${label}: your plan has NO quota for this model (free tier). Enable billing on the provider, or pick a different model/provider from the dropdown.`
      : `${label}: rate limit reached — wait ${retry ? `~${Math.ceil(Number(retry))} seconds` : 'a minute'} and try again.`;
  } else if (status === 401) {
    msg = `${label}: the API key was rejected — re-check it in Settings.`;
  } else if (status === 403) {
    msg = `${label}: access denied — this key may lack permission for this model, or billing isn't enabled.`;
  } else if (status === 402 || /insufficient[_ ]quota|billing|credit/i.test(detail)) {
    msg = `${label}: out of credits — top up your account on the provider's billing page.`;
  } else if (status === 404) {
    msg = `${label}: model not found — check the model name in Settings.`;
  } else if (status >= 500) {
    msg = `${label}: temporary problem on the provider's side (HTTP ${status}) — try again in a moment.`;
  } else {
    msg = `${label}: request failed (HTTP ${status})${detail ? ` — ${detail}` : ''}`;
  }
  return new Error(msg);
}

/** Mask a stored key for display: prefix + last 4, never the middle. */
export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 10) return '••••';
  return `${key.slice(0, 6)}••••••••••••${key.slice(-4)}`;
}

/**
 * One text completion. `provider` overrides the active/default provider (the
 * generation UIs pass the user's dropdown choice). Anthropic goes through the
 * official SDK; OpenAI/Groq/xAI share the chat-completions wire shape; Gemini
 * uses generateContent.
 */
export async function complete(
  prompt: string,
  { maxTokens = 4000, provider }: { maxTokens?: number; provider?: string } = {},
): Promise<string> {
  const providerId =
    provider && PROVIDERS.some((p) => p.id === provider) ? provider : await getActiveProvider();
  const key = await getProviderKey(providerId);
  const model = await getProviderModel(providerId);
  if (!key) throw new Error(`No API key configured for ${providerId} — add it in Settings`);

  if (providerId === 'anthropic') {
    try {
      const client = new Anthropic({ apiKey: key });
      const msg = await client.messages.create({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });
      const text = msg.content.find((b) => b.type === 'text');
      return text && 'text' in text ? text.text : '';
    } catch (e: any) {
      if (typeof e?.status === 'number') throw apiError('anthropic', e.status, e.message ?? '');
      throw e;
    }
  }

  if (providerId === 'edenai') {
    // Eden AI's OpenAI-compatible unified endpoint; model = "provider/model".
    const res = await fetch('https://api.edenai.run/v2/llm/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens }),
    });
    if (!res.ok) throw apiError('edenai', res.status, await res.text());
    const j = await res.json();
    return j.choices?.[0]?.message?.content ?? '';
  }

  if (providerId === 'gemini') {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    );
    if (!res.ok) throw apiError('gemini', res.status, await res.text());
    const j = await res.json();
    return j.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
  }

  // OpenAI-compatible chat completions: openai / groq / xai
  const base =
    providerId === 'groq' ? 'https://api.groq.com/openai/v1'
    : providerId === 'xai' ? 'https://api.x.ai/v1'
    : 'https://api.openai.com/v1';
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens }),
  });
  if (!res.ok) throw apiError(providerId, res.status, await res.text());
  const j = await res.json();
  return j.choices?.[0]?.message?.content ?? '';
}

/** Extract the first JSON array/object from an LLM reply (handles ``` fences). */
export function extractJSON<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = Math.min(...['[', '{'].map((c) => { const i = raw.indexOf(c); return i === -1 ? Infinity : i; }));
  if (!isFinite(start)) throw new Error('No JSON found in model reply');
  return JSON.parse(raw.slice(start).replace(/```\s*$/, '').trim()) as T;
}

function parseRetryDelayMs(message: string): number {
  const retryAfter = message.match(/retry-after[":\s]+(\d+)/i)?.[1];
  if (retryAfter) return Math.min(15000, Math.max(500, Number(retryAfter) * 1000));
  const seconds = message.match(/try again in ([\d.]+)s/i)?.[1];
  if (seconds) return Math.min(15000, Math.max(500, Number(seconds) * 1000));
  return 3000;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One JSON-structured completion, for the blog pipeline's stage calls (research,
 * draft, humanize, fact-check, SEO, editorial review, etc — every stage wants
 * `{...}` back, not prose). Reuses the same provider auth/routing as `complete()`
 * but additionally: asks for JSON mode where the provider's API supports it,
 * retries on 429 (honouring Retry-After / "try again in Ns" if present) and on
 * a JSON-parse failure (one corrective retry telling the model its last reply
 * didn't parse), and stops once `deadline` (a Date.now() timestamp) has passed
 * so a slow stage fails cleanly instead of running into Vercel's hard function
 * timeout with nothing surfaced to the caller.
 */
export async function completeJSON<T>(
  prompt: string,
  {
    system,
    maxTokens = 4000,
    provider,
    deadline = Infinity,
  }: { system?: string; maxTokens?: number; provider?: string; deadline?: number } = {},
): Promise<T> {
  const providerId =
    provider && PROVIDERS.some((p) => p.id === provider) ? provider : await getActiveProvider();
  const key = await getProviderKey(providerId);
  const model = await getProviderModel(providerId);
  if (!key) throw new Error(`No API key configured for ${providerId} — add it in Settings`);

  const maxAttempts = 3;
  let lastErr: Error = new Error('completeJSON: no attempt was made');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (Date.now() > deadline) throw lastErr;
    const correction =
      attempt > 1 && lastErr instanceof SyntaxError
        ? '\n\nYour previous response was not valid JSON. Reply with ONLY a single valid JSON object/array — no markdown fences, no commentary before or after it.'
        : '';
    try {
      const text = await rawCompletionForJson(providerId, key, model, system, prompt + correction, maxTokens);
      return extractJSON<T>(text);
    } catch (e: any) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (e?.status === 429) {
        const wait = Math.min(parseRetryDelayMs(e.message ?? ''), Math.max(0, deadline - Date.now()));
        if (wait > 0) await sleep(wait);
        continue;
      }
      if (e instanceof SyntaxError && attempt < maxAttempts) continue; // ask the model to fix its JSON
      if (attempt < maxAttempts && e?.status >= 500) continue; // transient provider error, just retry
      throw lastErr;
    }
  }
  throw lastErr;
}

/** Provider dispatch for completeJSON — same providers as `complete()`, but asks
 *  for JSON output mode where the API supports it, and threads a system prompt
 *  through properly instead of prepending it to the user message. */
async function rawCompletionForJson(
  providerId: string,
  key: string,
  model: string,
  system: string | undefined,
  prompt: string,
  maxTokens: number,
): Promise<string> {
  if (providerId === 'anthropic') {
    try {
      const client = new Anthropic({ apiKey: key });
      const msg = await client.messages.create({
        model,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        messages: [{ role: 'user', content: `${prompt}\n\nRespond with ONLY a single valid JSON object/array — no markdown fences, no commentary.` }],
      });
      const text = msg.content.find((b) => b.type === 'text');
      return text && 'text' in text ? text.text : '';
    } catch (e: any) {
      if (typeof e?.status === 'number') throw apiError('anthropic', e.status, e.message ?? '');
      throw e;
    }
  }

  if (providerId === 'gemini') {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      },
    );
    if (!res.ok) throw apiError('gemini', res.status, await res.text());
    const j = await res.json();
    return j.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
  }

  // OpenAI-compatible chat completions: openai / groq / xai / edenai — all
  // accept response_format:{type:'json_object'} and a system message.
  const messages = [
    ...(system ? [{ role: 'system', content: system }] : []),
    { role: 'user', content: prompt },
  ];
  if (providerId === 'edenai') {
    const res = await fetch('https://api.edenai.run/v2/llm/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, response_format: { type: 'json_object' } }),
    });
    if (!res.ok) throw apiError('edenai', res.status, await res.text());
    const j = await res.json();
    return j.choices?.[0]?.message?.content ?? '';
  }
  const base =
    providerId === 'groq' ? 'https://api.groq.com/openai/v1'
    : providerId === 'xai' ? 'https://api.x.ai/v1'
    : 'https://api.openai.com/v1';
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, response_format: { type: 'json_object' } }),
  });
  if (!res.ok) throw apiError(providerId, res.status, await res.text());
  const j = await res.json();
  return j.choices?.[0]?.message?.content ?? '';
}

// ── Image models (OpenAI + Gemini — reuse the same provider keys) ───────────

export interface ImageModel {
  id: string;
  provider: 'openai' | 'gemini' | 'edenai';
  label: string;
  best?: boolean; // default selection when its provider is configured
}

// Best-quality first — the editor preselects the best AVAILABLE entry.
export const IMAGE_MODELS: ImageModel[] = [
  { id: 'gpt-image-1', provider: 'openai', label: 'GPT Image 1 (OpenAI) — best quality', best: true },
  { id: 'gemini-2.5-flash-image', provider: 'gemini', label: 'Gemini 2.5 Flash Image (Nano Banana)' },
  { id: 'imagen-4.0-generate-001', provider: 'gemini', label: 'Imagen 4 (Gemini API)' },
  { id: 'dall-e-3', provider: 'openai', label: 'DALL·E 3 (OpenAI)' },
  { id: 'edenai-openai', provider: 'edenai', label: 'Eden AI — OpenAI images (aggregator)' },
];

/** Image models whose provider has a key configured. */
export async function getAvailableImageModels(): Promise<ImageModel[]> {
  const out: ImageModel[] = [];
  for (const m of IMAGE_MODELS) {
    if (await getProviderKey(m.provider)) out.push(m);
  }
  return out;
}

/** The stored default image model if still available, else the best available. */
export async function getDefaultImageModel(): Promise<string> {
  const available = await getAvailableImageModels();
  const stored = await getSetting('image_model');
  if (stored && available.some((m) => m.id === stored)) return stored;
  return available[0]?.id ?? '';
}

/** fetch() with a hard timeout, so a hung provider fails with a clean message
 *  instead of running out the clock on Vercel's own function timeout (which
 *  surfaces as a raw, unhelpful 504 with no error the UI can show). */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, label: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s — try a faster image model.`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Generate one landscape image and return the raw bytes. `quality` only applies
 *  to gpt-image-1 (low/medium/high) — "high" can take 45-60s+ and risks Vercel's
 *  Hobby-plan 60s hard function cap, so the caller's UI should surface that. */
export async function generateImage(modelId: string, prompt: string, quality?: string): Promise<Buffer> {
  const model = IMAGE_MODELS.find((m) => m.id === modelId);
  if (!model) throw new Error(`unknown image model "${modelId}"`);
  const key = await getProviderKey(model.provider);
  if (!key) throw new Error(`No ${model.provider} key configured — add it in Settings`);

  if (model.provider === 'openai') {
    // Images API. gpt-image-1 always returns b64_json; dall-e-3 needs asking.
    const body: Record<string, unknown> = {
      model: model.id,
      prompt,
      n: 1,
      size: model.id === 'dall-e-3' ? '1792x1024' : '1536x1024', // landscape
    };
    if (model.id === 'dall-e-3') body.response_format = 'b64_json';
    if (model.id === 'gpt-image-1') {
      body.quality = quality === 'low' || quality === 'high' ? quality : 'medium';
    }
    const res = await fetchWithTimeout('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    }, 55_000, 'OpenAI image generation');
    if (!res.ok) throw apiError('openai', res.status, await res.text());
    const j = await res.json();
    const d = j.data?.[0];
    if (d?.b64_json) return Buffer.from(d.b64_json, 'base64');
    if (d?.url) {
      const img = await fetch(d.url);
      if (!img.ok) throw new Error(`image download failed: HTTP ${img.status}`);
      return Buffer.from(await img.arrayBuffer());
    }
    throw new Error('OpenAI images: unexpected response shape');
  }

  if (model.provider === 'edenai') {
    const res = await fetchWithTimeout('https://api.edenai.run/v2/image/generation', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ providers: 'openai', text: prompt, resolution: '1024x1024' }),
    }, 50_000, 'Eden AI image generation');
    if (!res.ok) throw apiError('edenai', res.status, await res.text());
    const j = await res.json();
    const r = j.openai ?? Object.values(j)[0];
    if (r?.status === 'fail') throw new Error(`Eden AI: ${r?.error?.message ?? 'image generation failed'}`);
    const item = r?.items?.[0];
    if (item?.image) return Buffer.from(item.image, 'base64');
    if (item?.image_resource_url) {
      const img = await fetch(item.image_resource_url);
      if (!img.ok) throw new Error(`image download failed: HTTP ${img.status}`);
      return Buffer.from(await img.arrayBuffer());
    }
    throw new Error('Eden AI: unexpected response shape');
  }

  // Gemini API — two shapes: Imagen via :predict, Flash Image via generateContent.
  if (model.id.startsWith('imagen')) {
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:predict?key=${key}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { sampleCount: 1, aspectRatio: '16:9' },
        }),
      },
      50_000,
      'Gemini Imagen generation',
    );
    if (!res.ok) throw apiError('gemini', res.status, await res.text());
    const j = await res.json();
    const b64 = j.predictions?.[0]?.bytesBase64Encoded;
    if (!b64) throw new Error('Gemini Imagen: unexpected response shape');
    return Buffer.from(b64, 'base64');
  }

  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    },
    50_000,
    'Gemini image generation',
  );
  if (!res.ok) throw apiError('gemini', res.status, await res.text());
  const j = await res.json();
  const part = j.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data);
  if (!part) throw new Error('Gemini image: no image in response');
  return Buffer.from(part.inlineData.data, 'base64');
}
