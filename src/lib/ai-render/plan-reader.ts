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
      max_tokens: 800,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                "Read this architectural floor plan sketch.",
                "Output a CONCISE list of rooms, furniture, and key features",
                "in a format suitable for guiding image generation.",
                "Format each room on its own line like:",
                "  Room N (purpose, approx size): comma-separated list of items",
                "Example:",
                "  Room 1 (living room, ~26m²): sofa, coffee table, TV console, 2 armchairs",
                "  Room 2 (bedroom, ~15m²): bed, wardrobe, nightstand",
                "  Room 3 (bathroom, ~4m²): bathtub, sink, toilet",
                "",
                "Also mention any of these if visible: staircase, balcony,",
                "kitchen island, fireplace, large windows.",
                "Be concrete and specific. No flowery language.",
              ].join(" "),
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
