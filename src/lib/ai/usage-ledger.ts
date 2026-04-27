import { log } from "@/lib/logger";

/**
 * Centralised in-process AI usage tracker.
 *
 * Each LLM call should report its token counts here so the orchestrator
 * can attach a per-estimate cost to the final response. Pure observation —
 * no mutation, no provider calls.
 *
 * Pricing (USD per 1M tokens, list prices as of late 2025 / early 2026 —
 * verify against the latest provider page before invoicing customers):
 */

type Provider = "openai" | "anthropic" | "gemini";

export type UsageEntry = {
  provider: Provider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  cacheCreationTokens?: number;
  label?: string;
  ts: number;
};

const PRICING: Record<string, { input: number; output: number; cachedInput?: number; cacheWrite?: number }> = {
  // Anthropic — see https://www.anthropic.com/pricing
  "claude-opus-4-5": { input: 15, output: 75, cachedInput: 1.5, cacheWrite: 18.75 },
  "claude-opus-4-6": { input: 15, output: 75, cachedInput: 1.5, cacheWrite: 18.75 },
  "claude-opus-4-7": { input: 15, output: 75, cachedInput: 1.5, cacheWrite: 18.75 },
  "claude-sonnet-4-5": { input: 3, output: 15, cachedInput: 0.3, cacheWrite: 3.75 },
  "claude-sonnet-4-6": { input: 3, output: 15, cachedInput: 0.3, cacheWrite: 3.75 },
  "claude-haiku-4-5": { input: 1, output: 5, cachedInput: 0.1, cacheWrite: 1.25 },
  // OpenAI — see https://openai.com/api/pricing
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4-turbo": { input: 10, output: 30 },
  // Google Gemini — see https://ai.google.dev/pricing
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  "gemini-3-flash-preview": { input: 0.3, output: 2.5 },
};

class Ledger {
  private entries: UsageEntry[] = [];

  record(entry: Omit<UsageEntry, "ts">) {
    const full: UsageEntry = { ...entry, ts: Date.now() };
    this.entries.push(full);
    log.debug("ai:usage", {
      provider: entry.provider,
      model: entry.model,
      input: entry.inputTokens,
      output: entry.outputTokens,
      cachedInput: entry.cachedInputTokens,
      label: entry.label,
    });
  }

  snapshot(): UsageEntry[] {
    return this.entries.slice();
  }

  reset() {
    this.entries = [];
  }

  totals() {
    let inputTokens = 0;
    let outputTokens = 0;
    let cachedInputTokens = 0;
    let cacheCreationTokens = 0;
    let costUsd = 0;

    for (const e of this.entries) {
      inputTokens += e.inputTokens;
      outputTokens += e.outputTokens;
      cachedInputTokens += e.cachedInputTokens ?? 0;
      cacheCreationTokens += e.cacheCreationTokens ?? 0;

      const p = matchPricing(e.model);
      if (!p) continue;

      const uncachedInput = e.inputTokens - (e.cachedInputTokens ?? 0);
      costUsd +=
        (uncachedInput / 1_000_000) * p.input +
        (e.outputTokens / 1_000_000) * p.output +
        ((e.cachedInputTokens ?? 0) / 1_000_000) * (p.cachedInput ?? p.input * 0.1) +
        ((e.cacheCreationTokens ?? 0) / 1_000_000) * (p.cacheWrite ?? p.input * 1.25);
    }

    return {
      callCount: this.entries.length,
      inputTokens,
      outputTokens,
      cachedInputTokens,
      cacheCreationTokens,
      costUsd: Number(costUsd.toFixed(4)),
    };
  }
}

function matchPricing(model: string) {
  if (PRICING[model]) return PRICING[model];
  // tolerate dated suffixes ("claude-opus-4-7-20260101") — fall back to base id
  for (const key of Object.keys(PRICING)) {
    if (model.startsWith(key)) return PRICING[key];
  }
  return null;
}

/**
 * Per-run scoped ledger. The orchestrator should `start(estimateId)` at the
 * top of a run, hand the returned ledger to all agents via context, then
 * `end()` to flush totals into the estimate response.
 */
export function makeLedger(): Ledger {
  return new Ledger();
}

export type AiLedger = Ledger;
