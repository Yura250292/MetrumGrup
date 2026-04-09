"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type ProjectEstimateDTO = {
  id: string;
  number: string;
  title: string;
  status: string;
  totalAmount: string;
  finalClientPrice: string;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
};

const projectEstimatesKey = (projectId: string) =>
  ["project", projectId, "estimates"] as const;

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export function useProjectEstimates(projectId: string) {
  return useQuery({
    queryKey: projectEstimatesKey(projectId),
    queryFn: () =>
      jsonFetch<{ estimates: ProjectEstimateDTO[] }>(
        `/api/admin/projects/${projectId}/estimates`
      ).then((d) => d.estimates),
    enabled: !!projectId,
    refetchOnWindowFocus: true,
  });
}

export function useGenerateEstimateFromProject(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      projectType?: string;
      notes?: string;
      selectedFileIds?: string[];
    }) =>
      jsonFetch<{ estimateId: string }>(
        `/api/admin/projects/${projectId}/generate-estimate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectEstimatesKey(projectId) });
    },
  });
}
