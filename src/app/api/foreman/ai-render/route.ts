import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  requireForeman,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import { generateRender } from "@/lib/ai-render/fal-client";
import { FOREMAN_BUCKET } from "@/lib/foreman/r2";

export const runtime = "nodejs";
export const maxDuration = 300; // fal.ai може займати до 60-120s

const bodySchema = z.object({
  /** PNG base64 без data: префікса. */
  imageBase64: z.string().min(100),
  /** Опційний user-prompt для стилю. */
  prompt: z.string().trim().max(500).optional(),
});

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ENDPOINT = R2_ACCOUNT_ID
  ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  : process.env.R2_ENDPOINT;

let _s3: S3Client | null = null;
function s3(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
      },
    });
  }
  return _s3;
}

/**
 * Photoreal 3D рендер плану з меблями (foreman scope, без projectId).
 * Клієнт надсилає PNG snapshot SVG-плану → ми вантажимо в R2 →
 * передаємо публічний URL у fal.ai (FLOOR_PLAN_TO_3D) → повертаємо
 * URL фінального зображення.
 *
 * Чернетковий режим: результат НЕ зберігається в AiRenderJob БД.
 * Користувач може потім прикріпити до конкретного проєкту окремою дією.
 */
export async function POST(request: NextRequest) {
  let session;
  try {
    ({ session } = await requireForeman());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
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

  // Завантажуємо input у R2 під foreman scope
  if (!FOREMAN_BUCKET) {
    return NextResponse.json(
      { error: "R2 сховище не налаштоване на сервері" },
      { status: 500 },
    );
  }
  if (!process.env.R2_PUBLIC_BASE_URL) {
    return NextResponse.json(
      {
        error:
          "R2_PUBLIC_BASE_URL не налаштований — fal.ai потребує публічний URL",
      },
      { status: 500 },
    );
  }

  const timestamp = Date.now();
  const inputKey = `foreman/${session.user.id}/ai-renders/${timestamp}-input.png`;
  try {
    await s3().send(
      new PutObjectCommand({
        Bucket: FOREMAN_BUCKET,
        Key: inputKey,
        Body: buf,
        ContentType: "image/png",
        Metadata: {
          uploadedBy: session.user.id,
          source: "foreman-estimator-photoreal",
        },
      }),
    );
  } catch (e) {
    console.error("[foreman/ai-render] R2 upload failed", e);
    return NextResponse.json(
      { error: "Помилка завантаження у сховище" },
      { status: 500 },
    );
  }

  const inputUrl = `${process.env.R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${inputKey}`;
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

  // Опційно: завантажити результат у R2 щоб мати стабільний URL
  let storedOutputUrl: string | null = null;
  try {
    const resp = await fetch(outputUrl);
    if (resp.ok) {
      const outBuf = Buffer.from(await resp.arrayBuffer());
      const outputKey = `foreman/${session.user.id}/ai-renders/${timestamp}-output.png`;
      await s3().send(
        new PutObjectCommand({
          Bucket: FOREMAN_BUCKET,
          Key: outputKey,
          Body: outBuf,
          ContentType: "image/png",
        }),
      );
      storedOutputUrl = `${process.env.R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${outputKey}`;
    }
  } catch (e) {
    console.warn("[foreman/ai-render] failed to mirror output to R2", e);
  }

  return NextResponse.json({
    inputUrl,
    outputUrl: storedOutputUrl ?? outputUrl,
    // fal.ai URL короткоживучий — клієнт повинен скачати/закешувати якщо
    // йому потрібен довгий доступ. storedOutputUrl стабільний.
    durableUrl: storedOutputUrl,
  });
}
