"use client";

import { useEffect, useState } from "react";
import type { AssigneeCandidate } from "@/lib/assignees/types";

type Params = {
  roles?: string[];
  includeEmployees?: boolean;
  /** SSR-prefetched список — використовуємо як стартовий стан без додаткового fetch. */
  initial?: AssigneeCandidate[];
  /** Якщо false — нічого не fetch'имо. Для умовного завантаження. */
  enabled?: boolean;
};

type State = {
  data: AssigneeCandidate[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

/**
 * Hook для отримання уніфікованого списку User + Employee як кандидатів
 * на роль "відповідального" з GET /api/admin/assignee-candidates.
 *
 * Скоупається бекендом за поточною фірмою (cookie firm-override), тому
 * клієнтський код не керує firmId.
 */
export function useAssigneeCandidates({
  roles,
  includeEmployees = true,
  initial,
  enabled = true,
}: Params = {}): State {
  const [data, setData] = useState<AssigneeCandidate[]>(initial ?? []);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rolesKey = roles?.slice().sort().join(",") ?? "";

  async function load() {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (rolesKey) qs.set("roles", rolesKey);
      if (!includeEmployees) qs.set("includeEmployees", "0");
      const r = await fetch(`/api/admin/assignee-candidates?${qs}`, {
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { data: AssigneeCandidate[] };
      setData(j.data ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolesKey, includeEmployees, enabled]);

  return { data, isLoading, error, refetch: load };
}
