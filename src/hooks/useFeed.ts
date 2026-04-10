"use client";

import { useQuery } from "@tanstack/react-query";

export type FeedKind =
  | "completion_act"
  | "photo_report"
  | "estimate_approved"
  | "comment"
  | "chat_message"
  | "member_change";

export type FeedActor = {
  id: string;
  name: string;
  avatar: string | null;
};

export type FeedProject = {
  id: string;
  title: string;
  slug: string;
};

export type FeedItem = {
  id: string;
  kind: FeedKind;
  title: string;
  subtitle: string | null;
  createdAt: string;
  project: FeedProject | null;
  actor: FeedActor | null;
  link: string;
  preview?: string;
  amount?: number;
};

async function jsonFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export function useFeed(limit = 20) {
  return useQuery({
    queryKey: ["feed", limit],
    queryFn: () =>
      jsonFetch<{ items: FeedItem[]; nextCursor: string | null }>(
        `/api/admin/feed?limit=${limit}`
      ),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}
