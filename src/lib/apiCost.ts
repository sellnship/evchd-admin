// Server-only. Estimated USD cost of a pipeline run -- approximate, since provider pricing
// changes over time; the numbers below are a best-effort snapshot, not a billing-accurate figure.
// Shown in the Pipeline Report as a rough "what did this cost" signal, not an invoice. Price
// table rebuilt (not ported) for this project's actual configured models -- see PROVIDERS in
// lib/llm.ts.

export interface UsageEntry {
  promptTokens: number;
  completionTokens: number;
}

// $ per 1K tokens, keyed by the *default* model for each provider in lib/llm.ts's PROVIDERS. A
// provider whose model was changed in Settings falls through to $0 here rather than guessing --
// this is a display nicety, not something worth maintaining a full model registry for.
const CHAT_PRICE_PER_1K: Record<string, { prompt: number; completion: number }> = {
  'claude-opus-4-8': { prompt: 0.015, completion: 0.075 },
  'gpt-4o': { prompt: 0.0025, completion: 0.01 },
  'llama-3.3-70b-versatile': { prompt: 0.00059, completion: 0.00079 },
  'gemini-2.5-flash': { prompt: 0.0003, completion: 0.0025 },
  'grok-3': { prompt: 0.003, completion: 0.015 },
};

// Flat per-image estimate (image APIs don't bill by token). gpt-image-1's actual
// cost depends heavily on the "quality" tier, so it gets its own sub-table.
const IMAGE_COST_USD: Record<string, number> = {
  'gemini-2.5-flash-image': 0.04,
  'imagen-4.0-generate-001': 0.04,
  'dall-e-3': 0.08,
  'edenai-openai': 0.05,
};

export const GPT_IMAGE_QUALITIES = ['low', 'medium', 'high'] as const;
export type GptImageQuality = (typeof GPT_IMAGE_QUALITIES)[number];

const GPT_IMAGE_1_COST_USD: Record<GptImageQuality, number> = {
  low: 0.02,
  medium: 0.07,
  high: 0.19,
};

// Rough wall-clock time on OpenAI's non-streaming images endpoint at 1536x1024 —
// used only to drive the UI's estimate text and progress-bar pacing, not billing.
// "high" runs close to Vercel Hobby's 60s hard function cap (see lib/llm.ts's
// fetchWithTimeout, 50s) and can fail there; the UI should flag that risk.
const GPT_IMAGE_1_TIME_SEC: Record<GptImageQuality, number> = {
  low: 12,
  medium: 25,
  high: 48,
};

const IMAGE_TIME_SEC: Record<string, number> = {
  'gemini-2.5-flash-image': 8,
  'imagen-4.0-generate-001': 10,
  'dall-e-3': 15,
  'edenai-openai': 20,
};

export function estimateChatCostUsd(usage: UsageEntry[], model: string): number {
  const price = CHAT_PRICE_PER_1K[model];
  if (!price) return 0;
  return usage.reduce((sum, u) => sum + (u.promptTokens / 1000) * price.prompt + (u.completionTokens / 1000) * price.completion, 0);
}

export function estimateImageCostUsd(model: string, quality?: string): number {
  if (model === 'gpt-image-1') return GPT_IMAGE_1_COST_USD[quality as GptImageQuality] ?? GPT_IMAGE_1_COST_USD.medium;
  return IMAGE_COST_USD[model] ?? 0.04;
}

export function estimateImageTimeSec(model: string, quality?: string): number {
  if (model === 'gpt-image-1') return GPT_IMAGE_1_TIME_SEC[quality as GptImageQuality] ?? GPT_IMAGE_1_TIME_SEC.medium;
  return IMAGE_TIME_SEC[model] ?? 15;
}

export function formatUsd(amount: number): string {
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(3)}`;
}
