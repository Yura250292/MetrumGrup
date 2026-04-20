"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type CommentEntityType = "ESTIMATE" | "PROJECT" | "TASK" | "FINANCE_ENTRY";

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

export type CommentAttachment = {
  id: string;
  name: string;
  url: string;
  size: number;
  mimeType: string;
};

export type CommentDTO = {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  author: CommentAuthor;
  reactions: ReactionGroup[];
  mentions: { id: string; name: string }[];
  attachments?: CommentAttachment[];
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
      jsonFetch<{ data: CommentDTO[] }>(
        `/api/admin/comments?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`
      ).then((d) => d.data),
    enabled: !!entityId,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

type PostCommentInput = {
  body: string;
  attachments?: { name: string; url: string; r2Key?: string; size: number; mimeType: string }[];
};

export function usePostComment(entityType: CommentEntityType, entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: string | PostCommentInput) => {
      const payload =
        typeof input === "string"
          ? { entityType, entityId, body: input }
          : { entityType, entityId, body: input.body, attachments: input.attachments };
      return jsonFetch<{ data: CommentDTO }>("/api/admin/comments", {
        method: "POST",
        body: JSON.stringify(payload),
      }).then((d) => d.data);
    },
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

export function useUnreadCommentCount(
  entityType: CommentEntityType,
  entityId: string,
) {
  return useQuery({
    queryKey: ["comments-unread", entityType, entityId],
    queryFn: () =>
      jsonFetch<{ unreadCount: number }>(
        `/api/admin/comments/read?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
      ).then((d) => d.unreadCount),
    enabled: !!entityId,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useMarkCommentsRead(
  entityType: CommentEntityType,
  entityId: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      jsonFetch<{ ok: true }>("/api/admin/comments/read", {
        method: "POST",
        body: JSON.stringify({ entityType, entityId }),
      }),
    onSuccess: () => {
      qc.setQueryData(["comments-unread", entityType, entityId], 0);
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
