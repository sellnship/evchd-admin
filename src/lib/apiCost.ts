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

// Flat per-image estimate (image APIs don't bill by token).
const IMAGE_COST_USD: Record<string, number> = {
  'gpt-image-1': 0.04,
  'gemini-2.5-flash-image': 0.02,
  'imagen-4.0-generate-001': 0.02,
  'dall-e-3': 0.08,
  'edenai-openai': 0.04,
};

export function estimateChatCostUsd(usage: UsageEntry[], model: string): number {
  const price = CHAT_PRICE_PER_1K[model];
  if (!price) return 0;
  return usage.reduce((sum, u) => sum + (u.promptTokens / 1000) * price.prompt + (u.completionTokens / 1000) * price.completion, 0);
}

export function estimateImageCostUsd(model: string): number {
  return IMAGE_COST_USD[model] ?? 0.04;
}

export function formatUsd(amount: number): string {
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(3)}`;
}
