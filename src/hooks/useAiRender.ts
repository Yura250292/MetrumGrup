"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AiRenderJobDTO, AiStylePresetDTO, AiCreditsDTO, CreateRenderJobInput } from "@/lib/ai-render/types";

// ── Query Keys ────────────────────────────────────────────────────

const aiRenderJobsKey = (projectId: string) => ["project", projectId, "ai-render"] as const;
const aiRenderJobKey = (projectId: string, jobId: string) =>
  ["project", projectId, "ai-render", jobId] as const;
const aiStylePresetsKey = (projectId: string) => ["project", projectId, "ai-render", "styles"] as const;
const aiCreditsKey = (projectId: string) => ["project", projectId, "ai-render", "credits"] as const;

// ── Helpers ───────────────────────────────────────────────────────

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

// ── Hooks ─────────────────────────────────────────────────────────

/**
 * List all render jobs for a project.
 */
export function useAiRenderJobs(projectId: string) {
  return useQuery({
    queryKey: aiRenderJobsKey(projectId),
    queryFn: () =>
      jsonFetch<{ jobs: AiRenderJobDTO[]; credits: AiCreditsDTO }>(
        `/api/admin/projects/${projectId}/ai-render`
      ),
    enabled: !!projectId,
    refetchOnWindowFocus: true,
  });
}

/**
 * Poll a single render job status. Refetches every 3s while job is in progress.
 */
export function useAiRenderJob(projectId: string, jobId: string | null) {
  return useQuery({
    queryKey: aiRenderJobKey(projectId, jobId ?? ""),
    queryFn: () =>
      jsonFetch<{ job: AiRenderJobDTO }>(
        `/api/admin/projects/${projectId}/ai-render/${jobId}`
      ).then((d) => d.job),
    enabled: !!projectId && !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "COMPLETED" || status === "FAILED" || status === "CANCELLED") {
        return false;
      }
      return 3000;
    },
  });
}

/**
 * Create a new render job.
 */
export function useCreateAiRender(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRenderJobInput) =>
      jsonFetch<{ job: AiRenderJobDTO }>(`/api/admin/projects/${projectId}/ai-render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }).then((d) => d.job),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: aiRenderJobsKey(projectId) });
      qc.invalidateQueries({ queryKey: aiCreditsKey(projectId) });
    },
  });
}

/**
 * Cancel a render job.
 */
export function useCancelAiRender(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) =>
      jsonFetch<{ ok: true }>(`/api/admin/projects/${projectId}/ai-render/${jobId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: aiRenderJobsKey(projectId) });
    },
  });
}

/**
 * Load style presets.
 */
export function useAiStylePresets(projectId: string) {
  return useQuery({
    queryKey: aiStylePresetsKey(projectId),
    queryFn: () =>
      jsonFetch<{ presets: AiStylePresetDTO[] }>(
        `/api/admin/projects/${projectId}/ai-render/styles`
      ).then((d) => d.presets),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000, // presets don't change often
  });
}

/**
 * Get current credit balance.
 */
export function useAiCredits(projectId: string) {
  return useQuery({
    queryKey: aiCreditsKey(projectId),
    queryFn: () =>
      jsonFetch<{ credits: AiCreditsDTO }>(
        `/api/admin/projects/${projectId}/ai-render/credits`
      ).then((d) => d.credits),
    enabled: !!projectId,
  });
}
