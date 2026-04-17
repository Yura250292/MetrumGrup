import type { AiRenderMode, AiRenderStatus } from "@prisma/client";

// ── API Request / Response types ──────────────────────────────────

export interface CreateRenderJobInput {
  mode: AiRenderMode;
  inputFileId?: string;
  inputR2Key?: string;
  inputUrl?: string;
  stylePreset?: string;
  prompt?: string;
  strength?: number;
  controlnetType?: string;
  width?: number;
  height?: number;
}

export interface AiRenderJobDTO {
  id: string;
  projectId: string;
  mode: AiRenderMode;
  status: AiRenderStatus;
  inputUrl: string | null;
  stylePreset: string | null;
  prompt: string | null;
  strength: number;
  controlnetType: string | null;
  width: number;
  height: number;
  outputUrl: string | null;
  outputFileId: string | null;
  thumbnailUrl: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  creditsUsed: number;
  createdAt: string;
  completedAt: string | null;
  createdBy: { id: string; name: string };
}

export interface AiStylePresetDTO {
  id: string;
  name: string;
  label: string;
  description: string | null;
  thumbnailUrl: string | null;
  category: string;
}

export interface AiCreditsDTO {
  total: number;
  used: number;
  remaining: number;
}

// ── fal.ai types ──────────────────────────────────────────────────

export interface FalSubmitParams {
  mode: AiRenderMode;
  imageUrl: string | null;
  prompt: string;
  negativePrompt: string;
  strength: number;
  controlnetType: string;
  width: number;
  height: number;
  seed?: number;
}

export interface FalResult {
  images: Array<{ url: string; width: number; height: number }>;
  modelUrl?: string;
}
