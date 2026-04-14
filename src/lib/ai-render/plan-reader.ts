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
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are an expert architect analyzing a residential floor plan. Examine the sketch carefully and identify EVERY element you can see.

For each room, identify:
- Purpose (living room / bedroom / kitchen / bathroom / hallway / dining room / terrace / balcony / closet / office / pantry / laundry)
- Approximate size in m² or dimensions
- Position in the layout (top-left, center, bottom-right, etc.)
- Every furniture symbol and fixture visible in that room

For kitchens specifically note: stove/cooktop, oven, refrigerator, dishwasher, sink, kitchen island, countertop, pantry, microwave.

For bathrooms specifically note: bathtub, shower, toilet, bidet, sink/vanity, towel rail, washing machine.

For bedrooms specifically note: bed size (single/double/queen), wardrobe/closet, nightstands, desk, mirror.

For living areas specifically note: sofa (corner/straight/sectional), armchairs, coffee table, TV console, bookshelf, fireplace.

For dining areas: table shape (round/rectangular), number of chairs.

Also identify:
- Staircase: location, direction (going up/down), number of steps if visible
- Entrance door (usually with arrow or swing marker)
- Interior doors (position and swing direction)
- Windows in exterior walls
- Terrace or balcony if any
- Any measurements/dimensions shown

Output format — one room per line:
ROOM [name, ~Xm², position]: item1, item2, item3, ...
Then at the end:
STRUCTURE: list walls, doors, windows, stairs.

Be thorough. Do not miss anything. Do not add commentary — just the structured list.`,
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
