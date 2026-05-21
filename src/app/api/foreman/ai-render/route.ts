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

  const prompt = [
    "Photorealistic top-down floor plan visualization of a Ukrainian apartment interior.",
    "Preserve EXACT room walls, doors, windows and furniture positions from the input image.",
    "Modern minimalist style, soft natural daylight, wooden parquet flooring, ceramic tile in bathroom.",
    "Realistic furniture textures (fabric sofas, wooden tables, stainless steel appliances).",
    "Plants and small decor elements where appropriate.",
    "Clean architectural rendering, no people, no text overlays.",
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
        "people, text, watermark, low quality, blurry, distorted, deformed walls, broken perspective",
      strength: 0.75,
      controlnetType: "canny",
      width: 1024,
      height: 1024,
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
