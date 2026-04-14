/**
 * AI Render Service — orchestrates the full render pipeline:
 * 1. Load job from DB
 * 2. Build prompt
 * 3. Submit to fal.ai
 * 4. Upload result to R2
 * 5. Create ProjectFile
 * 6. Update job status
 * 7. Deduct credits
 */

import { prisma } from "@/lib/prisma";
import { uploadFileToR2 } from "@/lib/r2-client";
import { generateRender, isFalConfigured } from "./fal-client";
import { buildPrompt } from "./prompt-builder";
import { readFloorPlan } from "./plan-reader";
import type { AiRenderJobDTO, AiCreditsDTO, CreateRenderJobInput } from "./types";

const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL ?? "";

/**
 * Process an AI render job end-to-end.
 * Called in background after the API response is sent.
 */
export async function processRenderJob(jobId: string): Promise<void> {
  const job = await prisma.aiRenderJob.findUnique({
    where: { id: jobId },
  });
  if (!job || job.status !== "QUEUED") return;

  const startTime = Date.now();

  try {
    // Mark as processing
    await prisma.aiRenderJob.update({
      where: { id: jobId },
      data: { status: "PROCESSING", startedAt: new Date() },
    });

    // Load style preset if specified
    let stylePreset: { prompt: string; negativePrompt: string | null } | null = null;
    if (job.stylePreset) {
      stylePreset = await prisma.aiStylePreset.findUnique({
        where: { name: job.stylePreset },
        select: { prompt: true, negativePrompt: true },
      });
    }

    // For FLOOR_PLAN_TO_3D, use GPT-4o to read the plan first —
    // flux-pro/kontext alone tends to simplify structure (merges rooms,
    // loses furniture detail). A detailed room-by-room description in
    // the prompt dramatically improves structural fidelity.
    let planDescription: string | null = null;
    if (job.mode === "FLOOR_PLAN_TO_3D" && job.inputUrl) {
      planDescription = await readFloorPlan(job.inputUrl);
      if (planDescription) {
        console.log(`[ai-render] Plan reader output for ${jobId}:\n${planDescription}`);
      }
    }

    // Build prompt
    const { prompt, negativePrompt } = buildPrompt({
      stylePreset,
      userPrompt: job.prompt ?? "",
      mode: job.mode,
      planDescription,
    });

    // Submit to fal.ai
    const falResult = await generateRender({
      mode: job.mode,
      imageUrl: job.inputUrl,
      prompt,
      negativePrompt,
      strength: Number(job.strength),
      controlnetType: job.controlnetType ?? "none",
      width: job.width,
      height: job.height,
      seed: job.seed ?? undefined,
    });

    // Upload result to R2
    await prisma.aiRenderJob.update({
      where: { id: jobId },
      data: { status: "UPLOADING" },
    });

    const resultImageUrl = falResult.images[0].url;
    const imageResponse = await fetch(resultImageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download render from fal.ai: ${imageResponse.status}`);
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const fileName = `ai-render-${jobId}.png`;
    const imageFile = new File([imageBuffer], fileName, { type: "image/png" });

    const uploaded = await uploadFileToR2(
      imageFile,
      `projects/${job.projectId}/ai-renders`
    );

    // Create ProjectFile record
    const projectFile = await prisma.projectFile.create({
      data: {
        projectId: job.projectId,
        uploadedById: job.createdById,
        type: "AI_RENDER",
        category: "AI_VISUALIZATION",
        visibility: "TEAM",
        name: fileName,
        url: uploaded.url,
        r2Key: uploaded.key,
        size: imageBuffer.length,
        mimeType: "image/png",
      },
    });

    const durationMs = Date.now() - startTime;

    // Mark completed
    await prisma.aiRenderJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        outputR2Key: uploaded.key,
        outputUrl: uploaded.url,
        outputFileId: projectFile.id,
        completedAt: new Date(),
        durationMs,
        provider: "fal",
      },
    });

    // Deduct credits
    const creditsToDeduct = job.width > 1024 || job.height > 1024 ? 2 : 1;
    await prisma.aiCreditBalance.updateMany({
      data: {
        usedCredits: { increment: creditsToDeduct },
      },
    });

    console.log(`[ai-render] Job ${jobId} completed in ${durationMs}ms`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[ai-render] Job ${jobId} failed:`, errorMessage);

    await prisma.aiRenderJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        errorMessage,
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
      },
    });
  }
}

/**
 * Create a new render job and return it (does NOT start processing).
 */
export async function createRenderJob(
  projectId: string,
  createdById: string,
  input: CreateRenderJobInput
): Promise<AiRenderJobDTO> {
  if (!isFalConfigured()) {
    throw new Error("Сервіс AI візуалізації не налаштований (FAL_KEY відсутній)");
  }

  // Resolve input image URL (optional for TEXT_TO_RENDER mode)
  let inputR2Key: string | null = input.inputR2Key ?? null;
  let inputUrl: string | null = input.inputUrl ?? null;

  if (input.inputFileId && !inputUrl) {
    const file = await prisma.projectFile.findUnique({
      where: { id: input.inputFileId },
      select: { url: true, r2Key: true },
    });
    if (!file) throw new Error("Вхідний файл не знайдено");
    inputUrl = file.url;
    inputR2Key = file.r2Key ?? null;
  }

  const needsImage = input.mode !== "TEXT_TO_RENDER";
  if (needsImage && !inputUrl) {
    throw new Error("Потрібно вказати вхідне зображення");
  }

  if (input.mode === "TEXT_TO_RENDER" && !input.prompt?.trim()) {
    throw new Error("Для режиму «Текст → Рендер» потрібен опис");
  }

  // Check credits
  const credits = await getCredits();
  const creditsNeeded = (input.width ?? 1024) > 1024 || (input.height ?? 1024) > 1024 ? 2 : 1;
  if (credits.remaining < creditsNeeded) {
    throw new Error("Кредити вичерпано");
  }

  // Per-mode default parameters (tuned from real tests).
  // SKETCH_TO_RENDER: 0.92 — preserves structure, enough freedom for photoreal.
  // PHOTO_RERENDER: 0.60 — keeps shape, changes style/materials/lighting.
  // FLOOR_PLAN_TO_3D: 0.85 — kontext ignores this (uses its own params).
  // TEXT_TO_RENDER: n/a — no source image, strength unused.
  const strengthByMode: Record<string, number> = {
    SKETCH_TO_RENDER: 0.92,
    PHOTO_RERENDER: 0.6,
    FLOOR_PLAN_TO_3D: 0.85,
    TEXT_TO_RENDER: 1.0,
  };
  const defaultStrength = strengthByMode[input.mode] ?? 0.85;
  const defaultControlnet = input.mode === "SKETCH_TO_RENDER" ? "lineart" : "depth";

  const job = await prisma.aiRenderJob.create({
    data: {
      projectId,
      createdById,
      mode: input.mode,
      inputFileId: input.inputFileId ?? null,
      inputR2Key,
      inputUrl,
      stylePreset: input.stylePreset ?? null,
      prompt: input.prompt ?? null,
      strength: input.strength ?? defaultStrength,
      controlnetType: input.controlnetType ?? defaultControlnet,
      width: input.width ?? 1024,
      height: input.height ?? 1024,
    },
    include: {
      createdBy: { select: { id: true, name: true } },
    },
  });

  return toJobDTO(job);
}

/**
 * Get current credit balance. Creates a default row if none exists.
 */
export async function getCredits(): Promise<AiCreditsDTO> {
  let balance = await prisma.aiCreditBalance.findFirst();

  if (!balance) {
    const maxCredits = parseInt(process.env.AI_RENDER_MAX_CREDITS_MONTHLY ?? "100", 10);
    balance = await prisma.aiCreditBalance.create({
      data: { totalCredits: maxCredits, usedCredits: 0 },
    });
  }

  return {
    total: balance.totalCredits,
    used: balance.usedCredits,
    remaining: Math.max(0, balance.totalCredits - balance.usedCredits),
  };
}

// ── DTO helper ────────────────────────────────────────────────────

export function toJobDTO(job: {
  id: string;
  projectId: string;
  mode: string;
  status: string;
  inputUrl: string | null;
  stylePreset: string | null;
  prompt: string | null;
  strength: unknown;
  controlnetType: string | null;
  width: number;
  height: number;
  outputUrl: string | null;
  outputFileId: string | null;
  thumbnailUrl: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  creditsUsed: number;
  createdAt: Date;
  completedAt: Date | null;
  createdBy: { id: string; name: string };
}): AiRenderJobDTO {
  return {
    id: job.id,
    projectId: job.projectId,
    mode: job.mode as AiRenderJobDTO["mode"],
    status: job.status as AiRenderJobDTO["status"],
    inputUrl: job.inputUrl,
    stylePreset: job.stylePreset,
    prompt: job.prompt,
    strength: Number(job.strength),
    controlnetType: job.controlnetType,
    width: job.width,
    height: job.height,
    outputUrl: job.outputUrl,
    outputFileId: job.outputFileId,
    thumbnailUrl: job.thumbnailUrl,
    errorMessage: job.errorMessage,
    durationMs: job.durationMs,
    creditsUsed: job.creditsUsed,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
    createdBy: job.createdBy,
  };
}
