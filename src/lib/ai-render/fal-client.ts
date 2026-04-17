/**
 * fal.ai integration for AI architectural rendering.
 * Routes to different fal.ai models based on render mode:
 *  - SKETCH_TO_RENDER / PHOTO_RERENDER → flux/dev/image-to-image
 *  - TEXT_TO_RENDER                    → flux/dev (text-to-image)
 *  - FLOOR_PLAN_TO_3D                  → flux-pro/kontext (image edit)
 */

import * as fal from "@fal-ai/serverless-client";
import type { AiRenderMode } from "@prisma/client";
import type { FalSubmitParams, FalResult } from "./types";

fal.config({
  credentials: process.env.FAL_KEY,
});

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_DURATION_MS = 240_000;
const MAX_RETRIES = 2;

/**
 * Re-upload a source image to fal.ai storage. R2 URLs with non-ASCII
 * characters fail at fal.ai direct-download, so we always proxy.
 */
async function uploadToFalStorage(sourceUrl: string): Promise<string> {
  const resp = await fetch(sourceUrl);
  if (!resp.ok) {
    throw new Error(`Не вдалось завантажити вхідне зображення (${resp.status})`);
  }
  const contentType = resp.headers.get("content-type") || "image/jpeg";
  const buf = Buffer.from(await resp.arrayBuffer());
  const ext = contentType.includes("png") ? "png" : "jpg";
  const file = new File([buf], `input.${ext}`, { type: contentType });
  return await fal.storage.upload(file);
}

/**
 * Map aspect ratio from width/height. kontext accepts preset ratios only.
 */
function pickAspectRatio(w: number, h: number): string {
  const r = w / h;
  if (r > 1.4) return "16:9";
  if (r > 1.2) return "4:3";
  if (r > 0.85) return "1:1";
  if (r > 0.6) return "3:4";
  return "9:16";
}

/**
 * Build the fal.ai input payload and pick the model based on mode.
 */
async function buildModelRequest(
  params: FalSubmitParams
): Promise<{ modelId: string; input: Record<string, unknown> }> {
  const mode = params.mode;

  // TEXT_TO_RENDER — pure text-to-image, no input image
  if (mode === "TEXT_TO_RENDER") {
    return {
      modelId: "fal-ai/flux/dev",
      input: {
        prompt: params.prompt,
        image_size: { width: params.width, height: params.height },
        num_inference_steps: 35,
        guidance_scale: 7.0,
        num_images: 1,
        enable_safety_checker: false,
        ...(params.seed !== undefined && { seed: params.seed }),
      },
    };
  }

  // All other modes require an input image
  if (!params.imageUrl) {
    throw new Error("Вхідне зображення є обов'язковим для цього режиму");
  }
  const falImageUrl = await uploadToFalStorage(params.imageUrl);

  // FLOOR_PLAN_TO_3D — Seedream v4 edit preserves floor plan structure
  // far better than flux-pro/kontext. Tested: stairs, L-shaped kitchen,
  // bathroom fixtures, dining table with exact chair count, plants —
  // all rendered at correct positions. Takes ~28s vs kontext's 10s.
  if (mode === "FLOOR_PLAN_TO_3D") {
    return {
      modelId: "fal-ai/bytedance/seedream/v4/edit",
      input: {
        prompt: params.prompt,
        image_urls: [falImageUrl],
      },
    };
  }

  // TOPDOWN_TO_3D — take a photorealistic top-down render (from Seedream)
  // and convert to 3D perspective/isometric view using kontext.
  // Tested: produces stunning 3D cutaway, isometric, and eye-level views
  // when the input is already photorealistic (not a raw sketch).
  if (mode === "TOPDOWN_TO_3D") {
    return {
      modelId: "fal-ai/flux-pro/kontext",
      input: {
        prompt: params.prompt,
        image_url: falImageUrl,
        aspect_ratio: pickAspectRatio(params.width, params.height),
      },
    };
  }

  // SKETCH_TO_RENDER / PHOTO_RERENDER — flux/dev/image-to-image
  return {
    modelId: "fal-ai/flux/dev/image-to-image",
    input: {
      image_url: falImageUrl,
      prompt: params.prompt,
      negative_prompt: params.negativePrompt,
      strength: params.strength,
      image_size: { width: params.width, height: params.height },
      num_inference_steps: 35,
      guidance_scale: 7.0,
      num_images: 1,
      enable_safety_checker: false,
      ...(params.seed !== undefined && { seed: params.seed }),
    },
  };
}

/**
 * Submit a render job to fal.ai and poll until complete.
 */
export async function generateRender(
  params: FalSubmitParams
): Promise<FalResult> {
  const { modelId, input } = await buildModelRequest(params);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await fal.subscribe(modelId, {
        input,
        pollInterval: POLL_INTERVAL_MS,
        timeout: MAX_POLL_DURATION_MS,
        logs: false,
      });

      const output = result as {
        images?: Array<{ url: string; width?: number | null; height?: number | null }>;
        image?: { url: string; width?: number | null; height?: number | null };
      };

      // kontext returns `image` (singular), flux returns `images` (array)
      const rawImages = output.images ?? (output.image ? [output.image] : []);

      if (rawImages.length === 0) {
        throw new Error("fal.ai returned no images");
      }

      // Normalize: some models (Seedream) return null for width/height
      const images = rawImages.map((img) => ({
        url: img.url,
        width: img.width ?? params.width,
        height: img.height ?? params.height,
      }));

      return { images };
    } catch (err) {
      const rawErr = err as { name?: string; message?: string; status?: number; body?: { detail?: string | Array<{ msg: string }> } };

      let friendlyMessage = rawErr.message || String(err);
      const detail = rawErr.body?.detail;
      const detailStr = Array.isArray(detail)
        ? detail.map((d) => d.msg).join("; ")
        : detail;

      if (rawErr.status === 403 && detailStr?.includes("Exhausted balance")) {
        friendlyMessage = "Баланс fal.ai вичерпано. Поповніть на fal.ai/dashboard/billing";
      } else if (rawErr.status === 403) {
        friendlyMessage = `fal.ai: ${detailStr || "доступ заборонено"}`;
      } else if (rawErr.status === 401) {
        friendlyMessage = "fal.ai: невірний API ключ (FAL_KEY)";
      } else if (rawErr.status === 422) {
        friendlyMessage = `fal.ai: невалідні параметри — ${detailStr || "перевірте вхідні дані"}`;
      } else if (detailStr) {
        friendlyMessage = `fal.ai: ${detailStr}`;
      }

      lastError = new Error(friendlyMessage);

      const msg = (rawErr.message || "").toLowerCase();
      const isNonTransient =
        rawErr.status === 401 ||
        rawErr.status === 403 ||
        rawErr.status === 422 ||
        msg.includes("nsfw") ||
        msg.includes("invalid") ||
        msg.includes("not found");

      if (isNonTransient) throw lastError;

      if (attempt < MAX_RETRIES) {
        const backoffMs = Math.pow(2, attempt + 1) * 1000;
        console.log(`[fal-client] Retry ${attempt + 1}/${MAX_RETRIES} after ${backoffMs}ms`);
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
  }

  throw lastError ?? new Error("fal.ai generation failed after retries");
}

/**
 * Modes that don't require an input image.
 */
export function modeRequiresInputImage(mode: AiRenderMode): boolean {
  return mode !== "TEXT_TO_RENDER";
}

/**
 * Check if fal.ai is configured.
 */
export function isFalConfigured(): boolean {
  return !!process.env.FAL_KEY;
}
