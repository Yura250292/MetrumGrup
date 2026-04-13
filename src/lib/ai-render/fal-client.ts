/**
 * fal.ai integration for AI architectural rendering.
 * Uses the fal.ai queue API for async image generation with
 * Stable Diffusion / Flux + ControlNet.
 */

import * as fal from "@fal-ai/serverless-client";
import type { FalSubmitParams, FalResult } from "./types";

// Configure fal.ai client
fal.config({
  credentials: process.env.FAL_KEY,
});

const DEFAULT_MODEL = process.env.AI_RENDER_DEFAULT_MODEL || "fal-ai/flux/dev/image-to-image";
const CONTROLNET_MODEL = "fal-ai/flux/dev/image-to-image";

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_DURATION_MS = 120_000;
const MAX_RETRIES = 2;

/**
 * Submit an image generation job to fal.ai and poll until complete.
 * Returns the generated image URL(s).
 */
export async function generateRender(
  params: FalSubmitParams
): Promise<FalResult> {
  const modelId = params.controlnetType ? CONTROLNET_MODEL : DEFAULT_MODEL;

  const input: Record<string, unknown> = {
    image_url: params.imageUrl,
    prompt: params.prompt,
    negative_prompt: params.negativePrompt,
    strength: params.strength,
    image_size: {
      width: params.width,
      height: params.height,
    },
    num_inference_steps: 28,
    guidance_scale: 7.5,
    num_images: 1,
    enable_safety_checker: false,
  };

  if (params.seed !== undefined) {
    input.seed = params.seed;
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await fal.subscribe(modelId, {
        input,
        pollInterval: POLL_INTERVAL_MS,
        timeout: MAX_POLL_DURATION_MS,
        logs: false,
      });

      const output = result as { images?: Array<{ url: string; width: number; height: number }> };

      if (!output.images || output.images.length === 0) {
        throw new Error("fal.ai returned no images");
      }

      return { images: output.images };
    } catch (err) {
      const rawErr = err as { name?: string; message?: string; status?: number; body?: { detail?: string } };

      // Extract a meaningful error message from the fal.ai ApiError
      let friendlyMessage = rawErr.message || String(err);
      const detail = rawErr.body?.detail;

      if (rawErr.status === 403 && detail?.includes("Exhausted balance")) {
        friendlyMessage = "Баланс fal.ai вичерпано. Поповніть на fal.ai/dashboard/billing";
      } else if (rawErr.status === 403) {
        friendlyMessage = `fal.ai: ${detail || "доступ заборонено"}`;
      } else if (rawErr.status === 401) {
        friendlyMessage = "fal.ai: невірний API ключ (FAL_KEY)";
      } else if (rawErr.status === 422) {
        friendlyMessage = `fal.ai: невалідні параметри — ${detail || "перевірте вхідні дані"}`;
      } else if (detail) {
        friendlyMessage = `fal.ai: ${detail}`;
      }

      lastError = new Error(friendlyMessage);

      // Don't retry non-transient errors
      const msg = (rawErr.message || "").toLowerCase();
      const isNonTransient =
        rawErr.status === 401 ||
        rawErr.status === 403 ||
        rawErr.status === 422 ||
        msg.includes("nsfw") ||
        msg.includes("invalid") ||
        msg.includes("not found");

      if (isNonTransient) {
        throw lastError;
      }

      // Retry with backoff for transient errors (429, 500, timeout)
      if (attempt < MAX_RETRIES) {
        const backoffMs = Math.pow(2, attempt + 1) * 1000; // 2s, 4s
        console.log(`[fal-client] Retry ${attempt + 1}/${MAX_RETRIES} after ${backoffMs}ms`);
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
  }

  throw lastError ?? new Error("fal.ai generation failed after retries");
}

/**
 * Check if fal.ai is configured (API key present).
 */
export function isFalConfigured(): boolean {
  return !!process.env.FAL_KEY;
}
