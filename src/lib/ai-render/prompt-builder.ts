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
    "Carefully READ and INTERPRET this architectural floor plan sketch, then render it as a photorealistic top-down interior visualization. Identify and preserve: (1) EXTERIOR WALLS — the outer boundary of the building; (2) INTERIOR WALLS — every partition between rooms, exactly as drawn; (3) DOORS — openings in walls with door swings, keep their positions and swing direction; (4) WINDOWS — openings shown as double lines or gaps in exterior walls, preserve their positions and sizes; (5) EXISTING FURNITURE — any furniture symbols already drawn in the sketch (bed, table, sofa, toilet, sink, bathtub, kitchen appliances) must be rendered at the same positions with realistic appearance; (6) ROOM LABELS — if rooms are labeled (Living Room, Kitchen, Bedroom, Bathroom, Hallway), use them to choose appropriate furniture and materials; (7) DIMENSIONS — respect the proportions shown by dimension lines. CRITICAL RULES: do not merge rooms, do not move walls, do not add or remove rooms, do not move doors or windows. The output must have identical wall layout as the input. Apply photorealistic textures: wooden parquet flooring in living areas and bedrooms, ceramic tile in bathrooms, tile or wood in kitchen. For empty rooms, add appropriate furniture based on room label (bed in bedroom, sofa and coffee table in living room, dining table in kitchen, toilet-sink-bathtub in bathroom). Soft natural daylight from above. Top-down bird eye view, same orthographic perspective as the input sketch.",
};

const DEFAULT_NEGATIVE =
  "2D drawing, technical drawing, blueprint, flat illustration, cartoon, anime, sketch lines, wireframe, draft, blurry, low quality, distorted, deformed, watermark, text, signature, noise, artifacts, oversaturated, unrealistic";

export function buildPrompt(params: {
  stylePreset: StylePreset | null;
  userPrompt: string;
  mode: AiRenderMode;
  planDescription?: string | null;
}): { prompt: string; negativePrompt: string } {
  const parts: string[] = [];

  // For FLOOR_PLAN_TO_3D the mode suffix is an instruction, put it first.
  // If GPT-4o pre-read the plan, inject that description before styles.
  if (params.mode === "FLOOR_PLAN_TO_3D") {
    parts.push(MODE_SUFFIXES[params.mode]);
    if (params.planDescription) {
      parts.push(
        `Detailed layout analysis of the floor plan: ${params.planDescription}. ` +
        `RENDER REQUIREMENTS: render every single room listed above at its exact position. ` +
        `Render every furniture and fixture item listed for each room. ` +
        `In the kitchen render the stove/cooktop, refrigerator, sink, countertop exactly as described. ` +
        `In the bathroom render the bathtub, toilet, sink, washing machine exactly as listed. ` +
        `In bedrooms render the exact bed type, wardrobe, nightstands. ` +
        `In the living area render the sofa type, TV console, coffee table, armchairs as specified. ` +
        `In the dining area render the table shape and exact number of chairs. ` +
        `Render the staircase if mentioned. Render the terrace or balcony if mentioned. ` +
        `Do not substitute or simplify any items.`
      );
    }
    if (params.stylePreset?.prompt) parts.push(params.stylePreset.prompt);
    if (params.userPrompt.trim()) parts.push(params.userPrompt.trim());
  } else {
    if (params.stylePreset?.prompt) parts.push(params.stylePreset.prompt);
    if (params.userPrompt.trim()) parts.push(params.userPrompt.trim());
    parts.push(MODE_SUFFIXES[params.mode]);
  }

  const prompt = parts.join(", ");
  const negativePrompt = params.stylePreset?.negativePrompt || DEFAULT_NEGATIVE;

  return { prompt, negativePrompt };
}
