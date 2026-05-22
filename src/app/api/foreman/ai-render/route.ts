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
  /**
   * Структурований опис плану клієнт ще може надсилати — приймаємо й
   * ігноруємо (зворотна сумісність). Промпт будуємо без нього: за тестами
   * команди семантика кімнат лише заплутує Seedream.
   */
  layout: z.unknown().optional(),
});

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

  const userNote = parsed.data.prompt?.trim() || "";

  // ВЛАСНИЙ промпт foreman (НЕ спільний buildPrompt!). Спільний промпт містив
  // фразу "render fixtures (bathtub, toilet, sink, stove, bed, sofa...)" —
  // Seedream читав цей перелік як інструкцію НАМАЛЮВАТИ ванну/унітаз/плиту,
  // навіть коли їх немає в кімнаті (рендер вітальні виходив із санвузлом +
  // кухнею). Тут перелік типів НЕ згадуємо взагалі: "сірий силует = меблі,
  // малюй лише те, що фізично намальоване".
  const prompt = [
    "Convert this 2D top-down floor plan of a SINGLE room into a photorealistic top-down interior render.",
    "The image shows exactly ONE room. Render ONE room only — never split it, never add extra rooms, never add internal walls or partitions.",
    "The thick black outline is the room's walls — keep walls exactly where they are, same shape and proportions.",
    "Each solid GRAY SHAPE inside the room is one piece of furniture already placed by the user. Render every gray shape as a realistic furniture object of the SAME size, at the SAME position and orientation.",
    "Render ONLY the furniture drawn as gray shapes. DO NOT add any furniture, appliance or fixture that is not drawn. Floor areas that are empty in the plan MUST stay empty floor in the render.",
    "DO NOT invent a bathroom, kitchen, bed, sofa, toilet, bathtub, shower, stove or sink — render an object ONLY if its exact shape is physically drawn in this plan.",
    "Camera: strict top-down bird's-eye view, looking straight down at 90°, same framing and orientation as the input. NOT axonometric, NOT tilted, NOT angled.",
    "Keep geometry 1:1 with the input — only convert the flat 2D drawing into realistic materials, textures and lighting.",
    "Style: realistic modern Ukrainian interior, wood parquet or ceramic tile floor, soft natural daylight, gentle shadows.",
    "Output: clean photorealistic top-down render. No text, no labels, no dimensions, no people, no annotations.",
    userNote,
  ]
    .filter(Boolean)
    .join(" ");

  const negativePrompt =
    "extra rooms, multiple rooms, internal walls, room dividers, added furniture not in the plan, invented fixtures, people, text, watermark, labels, dimension lines, numbers, axonometric, isometric, 3D perspective, tilted camera, angled view, side view, dollhouse, blurry, low quality, distorted walls, cartoon, illustration";

  let result;
  try {
    result = await generateRender({
      mode: "FLOOR_PLAN_TO_3D",
      imageUrl: inputUrl,
      prompt,
      negativePrompt,
      // Seedream v4 edit для FLOOR_PLAN_TO_3D ігнорує strength/controlnet/
      // width/height — передаємо ті самі значення, що й проектний рендер.
      strength: 0.85,
      controlnetType: "none",
      width: 1024,
      height: 1024,
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
