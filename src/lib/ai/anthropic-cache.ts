/**
 * Anthropic prompt-caching helpers.
 *
 * Anthropic charges 25% on cache writes and 10% on cache reads (vs 100% for
 * uncached input). Marking the heavy, repeating parts of a prompt with
 * `cache_control: { type: "ephemeral" }` (5-minute TTL by default) gives big
 * wins on:
 *   - estimate generation re-runs over the same project documents
 *   - iterative refine flows that resend the same materials/work-items context
 *   - cross-validation passes where multiple agents see the same instructions
 *
 * Anthropic allows up to 4 cache breakpoints per request. We expose helpers
 * for the common cases:
 *   - `cachedSystem(text)`  — system prompt as a single cached block
 *   - `cachedTextBlock(text)` — content block with caching enabled
 *
 * The output is shaped to match the SDK's content-block discriminated unions
 * (see `Anthropic.Messages.MessageParam.content`).
 */

export type AnthropicTextBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};

export type AnthropicImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export type AnthropicImageBlock = {
  type: "image";
  source: {
    type: "base64";
    media_type: AnthropicImageMediaType;
    data: string;
  };
  cache_control?: { type: "ephemeral" };
};

export type AnthropicContentBlock = AnthropicTextBlock | AnthropicImageBlock;

export function cachedSystem(text: string): AnthropicTextBlock[] {
  if (!text) return [];
  return [{ type: "text", text, cache_control: { type: "ephemeral" } }];
}

export function cachedTextBlock(text: string): AnthropicTextBlock {
  return { type: "text", text, cache_control: { type: "ephemeral" } };
}

export function textBlock(text: string): AnthropicTextBlock {
  return { type: "text", text };
}

/**
 * Compose a `content` array with selective caching: stable preamble (cached)
 * + variable tail (uncached). Use when most of the prompt repeats and only
 * the project-specific tail differs.
 */
export function composeCachedContent(
  stable: string,
  variable: string,
  images: AnthropicImageBlock[] = []
): AnthropicContentBlock[] {
  const blocks: AnthropicContentBlock[] = [];
  if (stable) blocks.push(cachedTextBlock(stable));
  blocks.push(...images);
  if (variable) blocks.push(textBlock(variable));
  return blocks;
}
