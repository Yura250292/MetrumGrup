import type { AiRenderMode } from "@prisma/client";

interface StylePreset {
  prompt: string;
  negativePrompt: string | null;
}

const MODE_SUFFIXES: Record<AiRenderMode, string> = {
  SKETCH_TO_RENDER:
    "architectural visualization, photorealistic render, professional architectural photography, 8k resolution, hyperrealistic, ultra detailed, ray tracing, global illumination",
  PHOTO_RERENDER:
    "architectural visualization, enhanced photography, professional real estate photography, perfect lighting, color graded, ultra detailed",
};

const DEFAULT_NEGATIVE =
  "blurry, low quality, distorted, deformed, watermark, text, signature, cartoon, anime, sketch lines, wireframe, draft, noise, artifacts, oversaturated";

export function buildPrompt(params: {
  stylePreset: StylePreset | null;
  userPrompt: string;
  mode: AiRenderMode;
}): { prompt: string; negativePrompt: string } {
  const parts: string[] = [];

  if (params.stylePreset?.prompt) {
    parts.push(params.stylePreset.prompt);
  }

  if (params.userPrompt.trim()) {
    parts.push(params.userPrompt.trim());
  }

  parts.push(MODE_SUFFIXES[params.mode]);

  const prompt = parts.join(", ");
  const negativePrompt =
    params.stylePreset?.negativePrompt || DEFAULT_NEGATIVE;

  return { prompt, negativePrompt };
}
