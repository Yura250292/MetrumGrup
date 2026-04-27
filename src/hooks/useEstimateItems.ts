"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

export type EstimateItemCostType =
  | "MATERIAL"
  | "LABOR"
  | "SUBCONTRACT"
  | "EQUIPMENT"
  | "OVERHEAD"
  | "OTHER";

export type EstimateItemDTO = {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  sortOrder: number;
  sectionId: string | null;
  costCodeId: string | null;
  costType: EstimateItemCostType | null;
  costCode: { id: string; code: string; name: string } | null;
};

const estimateKey = (estimateId: string) => ["estimate", estimateId] as const;

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export function useAddEstimateItem(estimateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      sectionId: string;
      description?: string;
      unit?: string;
      quantity?: number;
      unitPrice?: number;
      costCodeId?: string | null;
      costType?: EstimateItemCostType | null;
    }) => {
      const body: Record<string, unknown> = {
        sectionId: input.sectionId,
        description: input.description ?? "",
        unit: input.unit ?? "шт",
        quantity: input.quantity ?? 1,
        unitPrice: input.unitPrice ?? 0,
      };
      if ("costCodeId" in input) body.costCodeId = input.costCodeId;
      if ("costType" in input) body.costType = input.costType;
      return jsonFetch<{ item: EstimateItemDTO }>(
        `/api/admin/estimates/${estimateId}/items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: estimateKey(estimateId) });
    },
  });
}

export function useUpdateEstimateItem(estimateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      itemId: string;
      patch: {
        description?: string;
        unit?: string;
        quantity?: number;
        unitPrice?: number;
        costCodeId?: string | null;
        costType?: EstimateItemCostType | null;
      };
    }) =>
      jsonFetch<{ item: EstimateItemDTO }>(
        `/api/admin/estimates/${estimateId}/items/${input.itemId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input.patch),
        }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: estimateKey(estimateId) });
    },
  });
}

export function useDeleteEstimateItem(estimateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) =>
      jsonFetch<{ ok: true }>(
        `/api/admin/estimates/${estimateId}/items/${itemId}`,
        { method: "DELETE" }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: estimateKey(estimateId) });
    },
  });
}
