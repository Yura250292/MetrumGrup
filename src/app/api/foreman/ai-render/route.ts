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

  const userPrompt = parsed.data.prompt?.trim() || "";

  // Prompt оптимізований для Seedream v4 edit моделі. Ключі для якісного
  // floor-plan→3D результату:
  //  - Чіткий стиль перспективи (axonometric top-down 3D view)
  //  - Збереження СТРУКТУРИ як обов'язкова інструкція
  //  - Конкретні матеріали (Seedream любить специфіку)
  //  - Освітлення і атмосфера
  //  - Detailed negative prompt (через сам prompt бо API не має negative).
  const prompt = [
    "Transform this 2D architectural floor plan into a photorealistic 3D axonometric top-down rendered interior view.",
    "Show the apartment from a slight aerial perspective (top-down with 25-30° tilt), as if walls were cut at 1.5m height — revealing floors, furniture and walls.",
    "STRICTLY PRESERVE: every wall position, room layout, door and window placements, furniture positions and orientations exactly as in the input plan. Do not move, add or remove anything structural.",
    "Style: contemporary Ukrainian apartment interior, modern minimalist Scandinavian-meets-warm style.",
    "Materials: oak or walnut parquet flooring in living areas, large-format ceramic tile in bathroom and kitchen splash zone, matte white painted walls, soft fabric upholstery on sofas in neutral tones (beige, sage, charcoal), wooden tables, brushed steel appliances, white sanitary ware.",
    "Lighting: soft warm natural daylight from windows, slight ambient shadows under furniture for depth, no harsh sun.",
    "Decor: indoor plants in clay pots near windows and corners, area rugs under sofa groups and beds, framed art on walls (subtle).",
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
