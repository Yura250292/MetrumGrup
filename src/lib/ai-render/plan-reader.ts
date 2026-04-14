/**
 * Floor plan reader — uses GPT-4o vision to extract structured
 * description from architectural drawings. This description is then
 * fed into flux-pro/kontext for much better structural fidelity.
 *
 * Tested: flux-pro/kontext alone simplifies floor plans (merges rooms,
 * loses detail). With a GPT-4o reading fed into the prompt, every
 * room, furniture piece, and key feature is preserved.
 */

import OpenAI from "openai";

const OPENAI_MODEL = "gpt-4o";

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

/**
 * Read a floor plan image and return a concise, structured description
 * suitable for guiding image generation. Format is room-by-room with
 * furniture and key features.
 *
 * Returns `null` if reading fails — caller should fall back to the
 * default prompt.
 */
export async function readFloorPlan(imageUrl: string): Promise<string | null> {
  try {
    // Download image and convert to base64
    const resp = await fetch(imageUrl);
    if (!resp.ok) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    const base64 = buf.toString("base64");
    const mimeType = resp.headers.get("content-type") || "image/jpeg";

    const openai = getClient();
    const result = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      max_tokens: 1800,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are an expert architect reading a residential floor plan. Your goal is to produce a POSITIONAL layout description that an image model can render exactly.

Divide the plan into a 3×3 grid (top-left, top-center, top-right, middle-left, center, middle-right, bottom-left, bottom-center, bottom-right). For EACH zone, state what is there.

For every room also list SPECIFIC fixtures/furniture visible in the sketch:
- Kitchen: stove/cooktop, oven, refrigerator, dishwasher, sink, island, L-shaped counter, cabinets
- Bathroom: bathtub, shower, toilet, sink/vanity, washing machine, tiles
- Bedroom: bed size (single/double/queen), wardrobe, nightstands
- Living: sofa type (L-shaped/straight/sectional), armchairs, coffee table, TV console
- Dining: table shape (round/rectangular), exact chair count, plants
- Also note: staircase (critical — describe position and direction), terrace, balcony, entrance door, windows

Output format — EXACTLY this structure, nothing else:

LAYOUT:
TOP-LEFT: <what is there + items>
TOP-CENTER: <what is there + items>
TOP-RIGHT: <what is there + items>
MIDDLE-LEFT: <what is there + items>
CENTER: <what is there + items>
MIDDLE-RIGHT: <what is there + items>
BOTTOM-LEFT: <what is there + items>
BOTTOM-CENTER: <what is there + items>
BOTTOM-RIGHT: <what is there + items>

KEY FEATURES:
- Staircase: <yes/no, position, going up/down>
- Entrance: <position>
- Terrace/balcony: <yes/no, position>
- Windows: <which walls have windows>

If a zone is empty or part of another room, write "(part of X)" or "(empty corridor)". Do not invent rooms. Read only what the sketch actually shows. Do not add commentary.`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
              },
            },
          ],
        },
      ],
    });

    const text = result.choices[0]?.message?.content?.trim();
    return text || null;
  } catch (err) {
    console.error("[plan-reader] Failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
