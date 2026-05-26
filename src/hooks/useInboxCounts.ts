"use client";

import { useQuery } from "@tanstack/react-query";

export type InboxCounts = {
  foremanReports: number;
  documents: number;
  receipts: number;
  formSubmissions: number;
};

const ZERO: InboxCounts = {
  foremanReports: 0,
  documents: 0,
  receipts: 0,
  formSubmissions: 0,
};

/// Polled pending-counts для бейджів у sidebar admin-v2 (група «Вхідні»).
/// Один HTTP-запит → 4 числа. Refetch кожні 30с, тільки коли вкладка активна.
export function useInboxCounts(): InboxCounts {
  const { data } = useQuery({
    queryKey: ["inbox-counts"],
    queryFn: async (): Promise<InboxCounts> => {
      const res = await fetch("/api/admin/inbox-counts");
      if (!res.ok) return ZERO;
      return res.json();
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
    staleTime: 15_000,
  });
  return data ?? ZERO;
}
