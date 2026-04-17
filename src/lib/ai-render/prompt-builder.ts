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
  TEXT_TO_RENDER:
    "photorealistic architectural visualization, professional architecture photography, exterior view of building, real materials and textures, natural lighting, golden hour, landscaping, ultra detailed, hyperrealistic, 8k resolution, unreal engine 5 quality, shot on Canon EOS R5",
  FLOOR_PLAN_TO_3D:
    "Photorealistic top-down interior visualization of this exact floor plan. Preserve every wall, door, and window position from the sketch. Render fixtures and furniture that are already drawn in the plan (bathtub, toilet, sink, stove, bed, sofa, table, chairs) at their exact positions. Apply realistic textures: wooden parquet flooring in living areas, ceramic tile in bathroom and kitchen. Soft natural daylight from above. Top-down bird eye view, same perspective as the input sketch. Do not invent furniture in empty rooms — leave small unlabeled rooms empty or as hallways.",
  TOPDOWN_TO_3D:
    "Transform this photorealistic top-down interior view into a stunning 3D perspective visualization, showing all rooms with walls visible at an angle, furniture and fixtures visible from above at a diagonal angle, professional architectural 3D render, warm natural lighting through windows, photorealistic materials and textures, 8k quality",
};

const DEFAULT_NEGATIVE =
  "2D drawing, technical drawing, blueprint, flat illustration, cartoon, anime, sketch lines, wireframe, draft, blurry, low quality, distorted, deformed, watermark, text, signature, noise, artifacts, oversaturated, unrealistic";

export function buildPrompt(params: {
  stylePreset: StylePreset | null;
  userPrompt: string;
  mode: AiRenderMode;
}): { prompt: string; negativePrompt: string } {
  const parts: string[] = [];

  // For FLOOR_PLAN_TO_3D: put the mode instruction first, then style/notes.
  // Seedream reads the sketch itself; we don't need an external plan reader.
  if (params.mode === "FLOOR_PLAN_TO_3D" || params.mode === "TOPDOWN_TO_3D") {
    parts.push(MODE_SUFFIXES[params.mode]);
    if (params.stylePreset?.prompt) parts.push(`Interior style: ${params.stylePreset.prompt}.`);
    if (params.userPrompt.trim()) parts.push(`User notes: ${params.userPrompt.trim()}.`);
  } else {
    if (params.stylePreset?.prompt) parts.push(params.stylePreset.prompt);
    if (params.userPrompt.trim()) parts.push(params.userPrompt.trim());
    parts.push(MODE_SUFFIXES[params.mode]);
  }

  const prompt = parts.join(", ");
  const negativePrompt = params.stylePreset?.negativePrompt || DEFAULT_NEGATIVE;

  return { prompt, negativePrompt };
}
