// Rough per-model token pricing, USD per 1M tokens.
// Treat as estimates — providers change these and we don't track tiers.
// Display "~$X.XX" in the UI to be honest about precision.

import type { TokensEvent } from "./types";

interface Price {
  in: number;
  out: number;
}

const PRICES: Record<string, Price> = {
  // Gemini
  "gemini/gemini-2.5-pro": { in: 1.25, out: 5.0 },
  "gemini/gemini-2.5-flash": { in: 0.3, out: 2.5 },
  "gemini/gemini-2.5-flash-lite": { in: 0.1, out: 0.4 },
  // Anthropic
  "anthropic/claude-opus-4-5": { in: 15.0, out: 75.0 },
  "anthropic/claude-sonnet-4-5": { in: 3.0, out: 15.0 },
  "anthropic/claude-haiku-4-5": { in: 1.0, out: 5.0 },
  // OpenAI (rough)
  "openai/gpt-5": { in: 1.25, out: 10.0 },
  "openai/gpt-5-mini": { in: 0.25, out: 2.0 },
};

const FALLBACK: Price = { in: 1.0, out: 5.0 };

export function estimateCostUSD(
  rootModel: string,
  subModel: string,
  tokens: TokensEvent
): number {
  const r = PRICES[rootModel] ?? FALLBACK;
  const s = PRICES[subModel] ?? FALLBACK;
  const root = (tokens.root_in * r.in + tokens.root_out * r.out) / 1_000_000;
  const sub = (tokens.sub_in * s.in + tokens.sub_out * s.out) / 1_000_000;
  return root + sub;
}

export function fmtUSD(amount: number): string {
  if (amount < 0.01) return "~<$0.01";
  if (amount < 1) return `~$${amount.toFixed(3)}`;
  return `~$${amount.toFixed(2)}`;
}
