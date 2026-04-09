"use client";

import { useQuery } from "@tanstack/react-query";

export type TeamMember = {
  id: string;
  name: string;
  avatar: string | null;
  role: string;
};

export type ProjectWithAggregations = {
  id: string;
  title: string;
  slug: string;
  status: string;
  currentStage: string;
  stageProgress: number;
  totalBudget: number;
  totalPaid: number;
  address: string | null;
  startDate: string | null;
  updatedAt: string;
  client: { name: string };
  manager: TeamMember | null;
  team: TeamMember[];
  commentCount: number;
  unreadChatCount: number;
  lastActivityAt: string;
};

async function jsonFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export function useProjectAggregations() {
  return useQuery({
    queryKey: ["projects", "aggregations"],
    queryFn: () =>
      jsonFetch<{ projects: ProjectWithAggregations[] }>("/api/admin/projects/aggregations").then(
        (d) => d.projects
      ),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}
