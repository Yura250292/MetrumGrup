"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type ReferenceEstimateListItem = {
  id: string;
  title: string;
  description: string | null;
  totalAreaM2: string;
  grandTotal: string;
  itemCount: number;
  sourceFormat: string | null;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
};

export type ReferenceEstimateDetailItem = {
  id: string;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  totalCost: string;
  kind: string;
  sortOrder: number;
};

export type ReferenceEstimateDetailSection = {
  id: string;
  title: string;
  sortOrder: number;
  sectionTotal: string;
  items: ReferenceEstimateDetailItem[];
};

export type ReferenceEstimateDetail = {
  id: string;
  title: string;
  description: string | null;
  totalAreaM2: string;
  grandTotal: string;
  itemCount: number;
  sourceFormat: string | null;
  createdAt: string;
  sections: ReferenceEstimateDetailSection[];
};

export type ParsedReferenceEstimate = {
  fileName: string;
  format: string;
  grandTotal: number;
  itemCount: number;
  sections: Array<{
    title: string;
    sortOrder: number;
    sectionTotal: number;
    items: Array<{
      description: string;
      unit: string;
      quantity: number;
      unitPrice: number;
      totalCost: number;
      kind: string;
      sortOrder: number;
    }>;
  }>;
};

const referenceEstimatesKey = ["reference-estimates"] as const;
const referenceEstimateKey = (id: string) =>
  ["reference-estimates", id] as const;

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export function useReferenceEstimates() {
  return useQuery({
    queryKey: referenceEstimatesKey,
    queryFn: () =>
      jsonFetch<{ data: ReferenceEstimateListItem[] }>(
        "/api/admin/reference-estimates"
      ).then((d) => d.data),
    refetchOnWindowFocus: false,
  });
}

export function useReferenceEstimate(id: string | null) {
  return useQuery({
    queryKey: id ? referenceEstimateKey(id) : ["reference-estimates", "null"],
    queryFn: () =>
      jsonFetch<{ data: ReferenceEstimateDetail }>(
        `/api/admin/reference-estimates/${id}`
      ).then((d) => d.data),
    enabled: !!id,
    refetchOnWindowFocus: false,
  });
}

export function useParseReferenceFile() {
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/reference-estimates/parse", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Не вдалося розпарсити файл");
      }
      const json = (await res.json()) as { data: ParsedReferenceEstimate };
      return json.data;
    },
  });
}

export function useCreateReferenceEstimate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      title: string;
      description?: string;
      totalAreaM2: number;
      sourceFormat?: string;
      sections: ParsedReferenceEstimate["sections"];
    }) =>
      jsonFetch<{ data: { id: string } }>("/api/admin/reference-estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: referenceEstimatesKey });
    },
  });
}

export function useDeleteReferenceEstimate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      jsonFetch<{ data: { id: string } }>(
        `/api/admin/reference-estimates/${id}`,
        { method: "DELETE" }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: referenceEstimatesKey });
    },
  });
}

export function useCreateEstimateFromCalculator() {
  return useMutation({
    mutationFn: (input: {
      projectId: string;
      referenceId: string;
      newAreaM2: number;
      title?: string;
      description?: string;
    }) =>
      jsonFetch<{ data: { id: string } }>(
        "/api/admin/estimates/from-calculator",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }
      ),
  });
}
