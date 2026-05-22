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
  // Камера — СТРОГО зверху (bird's-eye), як у проектній AI-візуалізації
  // (FLOOR_PLAN_TO_3D у prompt-builder.ts). Без axonometric/dollhouse нахилу.
  // Ключове повідомлення: PRESERVE — model має точно відтворити вхідну
  // структуру.
  const prompt = [
    "Photorealistic top-down interior visualization of this exact floor plan.",
    "Camera angle: strict top-down bird's-eye view — camera looking straight down at 90°, identical perspective, framing and orientation to the input plan. This MUST be a flat top-down view. NOT axonometric, NOT isometric, NOT angled, NOT tilted, NOT a dollhouse/cabinet view — never show walls from the side.",
    "ABSOLUTELY CRITICAL — STRUCTURAL FIDELITY: Every wall, room boundary, door position, window position, and piece of furniture in the input plan MUST appear in EXACTLY the same location and orientation in the render. DO NOT rearrange the layout. DO NOT add or remove rooms. DO NOT shift walls. The render must be an exact 1:1 reconstruction of the 2D plan.",
    "Only transform the visual style from a flat 2D drawing into photorealistic materials, textures and lighting — keep the geometry and the strict top-down camera unchanged.",
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
    "Quality: high resolution, photorealistic textures, clean geometry, professional top-down architectural floor plan render.",
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
        "axonometric, isometric, 3D perspective, angled camera, tilted view, side view, dollhouse view, walls seen from the side, people, text, watermark, labels, dimensions, measurement annotations, compass, arrows, low quality, blurry, distorted, deformed walls, broken perspective, cartoon, illustration, isometric video game style",
      // Seedream v4 edit ігнорує strength/controlnetType (вони лише для
      // інших моделей), але передаємо як no-op для сумісності типу.
      strength: 0.8,
      controlnetType: "canny",
      width: 2048,
      height: 2048,
    });
  } catch (e) {
    console.error("[foreman/ai-render] fal.ai failed", e);
    const raw = e instanceof Error ? e.message : String(e);
    // Friendly messages для типових проблем
    let friendly = raw.slice(0, 200);
    if (/balance|insufficient|funds|credit/i.test(raw)) {
      friendly = "На fal.ai не вистачає коштів. Поповніть баланс fal API.";
    } else if (/timeout|timed out|exceeded/i.test(raw)) {
      friendly =
        "Генерація зайняла надто багато часу. Спробуйте ще раз — можливо план занадто складний для одного проходу.";
    } else if (/rate.?limit|429/i.test(raw)) {
      friendly = "Забагато паралельних запитів до fal.ai. Зачекайте 30 с і повторіть.";
    } else if (/network|fetch|ECONN|ETIMED/i.test(raw)) {
      friendly = "Проблема з мережею до fal.ai. Спробуйте за хвилину.";
    }
    return NextResponse.json({ error: friendly }, { status: 500 });
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
