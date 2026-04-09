"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type CommentEntityType = "ESTIMATE" | "PROJECT";

export type ReactionGroup = {
  emoji: string;
  count: number;
  users: { id: string; name: string }[];
  reactedByMe: boolean;
};

export type CommentAuthor = {
  id: string;
  name: string;
  avatar: string | null;
  role: string;
};

export type CommentDTO = {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  author: CommentAuthor;
  reactions: ReactionGroup[];
  mentions: { id: string; name: string }[];
};

export const commentsKeys = {
  all: ["comments"] as const,
  list: (entityType: CommentEntityType, entityId: string) =>
    ["comments", entityType, entityId] as const,
};

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export function useComments(entityType: CommentEntityType, entityId: string) {
  return useQuery({
    queryKey: commentsKeys.list(entityType, entityId),
    queryFn: () =>
      jsonFetch<{ comments: CommentDTO[] }>(
        `/api/admin/comments?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`
      ).then((d) => d.comments),
    enabled: !!entityId,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function usePostComment(entityType: CommentEntityType, entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      jsonFetch<{ comment: CommentDTO }>("/api/admin/comments", {
        method: "POST",
        body: JSON.stringify({ entityType, entityId, body }),
      }).then((d) => d.comment),
    onSuccess: (comment) => {
      qc.setQueryData<CommentDTO[]>(
        commentsKeys.list(entityType, entityId),
        (prev) => (prev ? [...prev, comment] : [comment])
      );
    },
  });
}

export function useDeleteComment(entityType: CommentEntityType, entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) =>
      jsonFetch<{ ok: true }>(`/api/admin/comments/${commentId}`, {
        method: "DELETE",
      }),
    onSuccess: (_data, commentId) => {
      qc.setQueryData<CommentDTO[]>(
        commentsKeys.list(entityType, entityId),
        (prev) => (prev ? prev.filter((c) => c.id !== commentId) : prev)
      );
    },
  });
}

export function useToggleCommentReaction(
  entityType: CommentEntityType,
  entityId: string
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, emoji }: { commentId: string; emoji: string }) =>
      jsonFetch<{ reactions: ReactionGroup[] }>(
        `/api/admin/comments/${commentId}/reactions`,
        {
          method: "POST",
          body: JSON.stringify({ emoji }),
        }
      ).then((d) => d.reactions),
    onSuccess: (reactions, { commentId }) => {
      qc.setQueryData<CommentDTO[]>(
        commentsKeys.list(entityType, entityId),
        (prev) =>
          prev
            ? prev.map((c) => (c.id === commentId ? { ...c, reactions } : c))
            : prev
      );
    },
  });
}
