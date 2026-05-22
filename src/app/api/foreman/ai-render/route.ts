import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import * as fal from "@fal-ai/serverless-client";
import {
  requireForeman,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import { generateRender } from "@/lib/ai-render/fal-client";

export const runtime = "nodejs";
export const maxDuration = 300; // fal.ai може займати до 60-120s

const bodySchema = z.object({
  /** PNG base64 без data: префікса. */
  imageBase64: z.string().min(100),
  /** Опційний user-prompt для стилю. */
  prompt: z.string().trim().max(500).optional(),
  /** Структурований опис плану — для збагачення промпта семантикою. */
  layout: z
    .object({
      rooms: z
        .array(
          z.object({
            name: z.string(),
            classification: z.string().optional(),
            x: z.number(),
            y: z.number(),
            w: z.number(),
            h: z.number(),
            furnitureLabels: z.array(z.string()).optional(),
          }),
        )
        .max(40),
      openings: z
        .array(
          z.object({
            type: z.enum(["door", "window"]),
            roomName: z.string().optional(),
          }),
        )
        .max(80)
        .default([]),
      bbox: z.object({ w: z.number(), h: z.number() }),
    })
    .optional(),
});

const ROOM_CLASS_EN: Record<string, string> = {
  kitchen: "kitchen with stove, sink, refrigerator, cabinets",
  bedroom: "bedroom with bed and wardrobe",
  bathroom: "bathroom with toilet, sink, bathtub or shower",
  livingroom: "living room with sofa, TV, coffee table",
  corridor: "corridor / hallway passage",
  hallway: "entrance hallway with coat storage",
  office: "home office with desk and chair",
  diningroom: "dining room with table and chairs",
  balcony: "balcony with outdoor seating",
  storage: "storage closet with shelves",
  other: "general room",
};

/** Позиція "top-left", "center", "bottom-right" і т.д. — для prompt context. */
function describePosition(
  room: { x: number; y: number; w: number; h: number },
  bbox: { w: number; h: number },
): string {
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;
  const xZone = cx < bbox.w / 3 ? "left" : cx < (2 * bbox.w) / 3 ? "center" : "right";
  const yZone = cy < bbox.h / 3 ? "top" : cy < (2 * bbox.h) / 3 ? "middle" : "bottom";
  if (xZone === "center" && yZone === "middle") return "center";
  if (yZone === "middle") return xZone === "left" ? "left side" : "right side";
  if (xZone === "center") return yZone === "top" ? "top center" : "bottom center";
  return `${yZone}-${xZone}`;
}

fal.config({ credentials: process.env.FAL_KEY });

/**
 * Photoreal 3D рендер плану з меблями (foreman scope, без projectId).
 * Клієнт надсилає PNG snapshot SVG-плану → ми вантажимо напряму в fal.storage →
 * передаємо URL у fal.ai (FLOOR_PLAN_TO_3D) → повертаємо URL фінального
 * зображення.
 *
 * Чернетковий режим: результат НЕ зберігається в AiRenderJob БД. Не залежить
 * від R2 — пряме використання fal storage (yes works for foreman без проєкту).
 */
export async function POST(request: NextRequest) {
  try {
    await requireForeman();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }

  if (!process.env.FAL_KEY) {
    return NextResponse.json(
      { error: "FAL_KEY не налаштований на сервері" },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Невірний запит" }, { status: 400 });
  }

  const buf = Buffer.from(parsed.data.imageBase64, "base64");
  if (buf.length === 0 || buf.length > 8 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Зображення порожнє або завелике (max 8 МБ)" },
      { status: 400 },
    );
  }

  // Завантажуємо PNG напряму у fal storage (без R2)
  let inputUrl: string;
  try {
    const file = new File([buf], `foreman-plan-${Date.now()}.png`, {
      type: "image/png",
    });
    inputUrl = await fal.storage.upload(file);
  } catch (e) {
    console.error("[foreman/ai-render] fal.storage upload failed", e);
    return NextResponse.json(
      { error: "Не вдалось завантажити зображення в fal.ai" },
      { status: 500 },
    );
  }

  const userPrompt = parsed.data.prompt?.trim() || "";
  const layout = parsed.data.layout;

  // Структурний опис плану — Seedream краще розуміє коли є явна семантика
  // призначення кожної кімнати і конкретний підрахунок дверей/вікон.
  let layoutDescription = "";
  if (layout && layout.rooms.length > 0) {
    const roomLines = layout.rooms.map((r) => {
      const pos = describePosition(r, layout.bbox);
      const classKey = (r.classification ?? "other").toLowerCase();
      const semDesc = ROOM_CLASS_EN[classKey] ?? "general room";
      const furniturePart =
        r.furnitureLabels && r.furnitureLabels.length > 0
          ? ` containing: ${r.furnitureLabels.slice(0, 8).join(", ")}`
          : "";
      return `  • ${pos} (${r.w.toFixed(1)}×${r.h.toFixed(1)} m): ${semDesc}${furniturePart}`;
    });

    const doorCount = layout.openings.filter((o) => o.type === "door").length;
    const windowCount = layout.openings.filter((o) => o.type === "window").length;

    layoutDescription = [
      "",
      "LAYOUT (rooms by position — render each room with appropriate finishes and lighting for its function):",
      ...roomLines,
      "",
      `OPENINGS: exactly ${doorCount} door(s) marked by arc swing symbols, and ${windowCount} window(s) marked by double parallel line symbols. Render them as functional doors and windows in the 3D view at the exact positions shown.`,
      "",
    ].join("\n");
  }

  // Prompt оптимізований для Seedream v4 edit моделі.
  const prompt = [
    "Transform this 2D architectural floor plan into a photorealistic 3D axonometric top-down rendered interior view.",
    "Show the apartment from a slight aerial perspective (top-down with 25-30° tilt), as if walls were cut at 1.5m height — revealing floors, furniture and walls.",
    "STRICTLY PRESERVE: every wall position, room layout, door and window placements, furniture positions and orientations exactly as in the input plan. Do not move, add or remove anything structural.",
    layoutDescription,
    "RENDERING per room type:",
    "- Kitchen: marble or quartz countertops, stainless steel appliances, tile splashback, wooden cabinets, hanging pendant lights",
    "- Bathroom: large-format ceramic tile floor and walls, white sanitary ware (toilet, sink, bathtub/shower), chrome fixtures, towels on rails",
    "- Bedroom: oak parquet, made bed with neutral linen, bedside lamps, area rug under bed, soft warm lighting",
    "- Living room: oak parquet, fabric sofa in beige/sage/charcoal, wooden coffee table, TV unit, large area rug, indoor plants, framed art",
    "- Office: desk with task lamp, ergonomic chair, bookshelf, plants",
    "- Corridor / hallway: parquet, console with mirror, coat rack near entrance",
    "Style: contemporary Ukrainian apartment, modern minimalist Scandinavian-meets-warm.",
    "Lighting: soft warm natural daylight through windows, slight ambient shadows under furniture for depth, no harsh sun.",
    "Decor: indoor plants in clay pots near windows and corners, area rugs under sofa groups and beds.",
    "Quality: high resolution, photorealistic textures, clean geometry, professional interior render style (like ArchDaily or Behance).",
    "DO NOT include: people, text, watermarks, labels, dimension numbers, measurement annotations, compass symbols, arrows or any overlay graphics. Clean unannotated interior.",
    userPrompt,
  ]
    .filter(Boolean)
    .join(" ");

  let result;
  try {
    result = await generateRender({
      mode: "FLOOR_PLAN_TO_3D",
      imageUrl: inputUrl,
      prompt,
      negativePrompt:
        "people, text, watermark, labels, dimensions, measurement annotations, compass, arrows, low quality, blurry, distorted, deformed walls, broken perspective, cartoon, illustration, isometric video game style",
      // Seedream v4 edit ігнорує strength/controlnetType (вони лише для
      // інших моделей), але передаємо як no-op для сумісності типу.
      strength: 0.8,
      controlnetType: "canny",
      width: 2048,
      height: 2048,
    });
  } catch (e) {
    console.error("[foreman/ai-render] fal.ai failed", e);
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message.slice(0, 200)
            : "Помилка генерації photoreal",
      },
      { status: 500 },
    );
  }

  const outputUrl = result.images[0]?.url;
  if (!outputUrl) {
    return NextResponse.json(
      { error: "fal.ai не повернув зображення" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    inputUrl,
    outputUrl,
  });
}
