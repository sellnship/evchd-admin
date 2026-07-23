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
    const client = new Anthropic({ apiKey: key });
    const msg = await client.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content.find((b) => b.type === 'text');
    return text && 'text' in text ? text.text : '';
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
    if (!res.ok) throw new Error(`Gemini: HTTP ${res.status} ${await res.text()}`);
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
  if (!res.ok) throw new Error(`${providerId}: HTTP ${res.status} ${await res.text()}`);
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

// ── Image models (fal.ai) ───────────────────────────────────────────────────

export interface ImageModel {
  id: string;      // fal endpoint
  label: string;
  best?: boolean;  // default selection
}

// Best-quality first — the blog editor preselects the `best` entry.
export const IMAGE_MODELS: ImageModel[] = [
  { id: 'fal-ai/imagen4/preview/ultra', label: 'Imagen 4 Ultra — best quality', best: true },
  { id: 'fal-ai/imagen4', label: 'Imagen 4 — engine default' },
  { id: 'fal-ai/flux-pro/v1.1', label: 'FLUX 1.1 Pro' },
  { id: 'fal-ai/flux/dev', label: 'FLUX.1 Dev — fastest/cheapest' },
];

export async function getFalKey(): Promise<string> {
  return (await getSetting('llm_fal_key')) || env('FAL_KEY');
}

/**
 * Generate one 16:9 image via fal.ai and return the raw bytes.
 * Imagen models take `aspect_ratio`; FLUX models take `image_size`.
 */
export async function generateImage(modelId: string, prompt: string): Promise<Buffer> {
  const key = await getFalKey();
  if (!key) throw new Error('No fal.ai key configured — add it in Settings');

  const isFlux = modelId.includes('flux');
  const input = isFlux
    ? { prompt, image_size: 'landscape_16_9', num_images: 1 }
    : { prompt, aspect_ratio: '16:9', num_images: 1 };

  // fal's queue-run endpoint (synchronous mode) — no SDK needed server-side.
  const res = await fetch(`https://fal.run/${modelId}`, {
    method: 'POST',
    headers: { authorization: `Key ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`fal.ai ${modelId}: HTTP ${res.status} ${await res.text()}`);
  const j = await res.json();
  const url = j?.images?.[0]?.url;
  if (!url) throw new Error(`fal.ai ${modelId}: unexpected response shape`);
  const img = await fetch(url);
  if (!img.ok) throw new Error(`image download failed: HTTP ${img.status}`);
  return Buffer.from(await img.arrayBuffer());
}
