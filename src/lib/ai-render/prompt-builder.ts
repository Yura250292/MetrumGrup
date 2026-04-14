import type { AiRenderMode } from "@prisma/client";

interface StylePreset {
  prompt: string;
  negativePrompt: string | null;
}

const MODE_SUFFIXES: Record<AiRenderMode, string> = {
  SKETCH_TO_RENDER:
    "photorealistic 3D architectural visualization, professional architectural photography, real materials with detailed textures, natural lighting, exterior view from street level, ultra detailed, hyperrealistic, 8k resolution, unreal engine 5 quality, ray tracing, global illumination, shot on Canon EOS R5, sharp focus",
  PHOTO_RERENDER:
    "architectural visualization, enhanced photorealistic rendering, professional real estate photography, perfect natural lighting, color graded, ultra detailed materials, 8k resolution, sharp focus",
};

const DEFAULT_NEGATIVE =
  "2D drawing, technical drawing, blueprint, flat illustration, cartoon, anime, sketch lines, wireframe, draft, blurry, low quality, distorted, deformed, watermark, text, signature, noise, artifacts, oversaturated, unrealistic";

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
