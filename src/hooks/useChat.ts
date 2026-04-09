"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type ChatPeer = {
  id: string;
  name: string;
  avatar: string | null;
  role: string;
};

export type ReactionGroup = {
  emoji: string;
  count: number;
  users: { id: string; name: string }[];
  reactedByMe: boolean;
};

export type ChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  authorId: string;
  author: ChatPeer;
  reactions: ReactionGroup[];
};

export type EstimateRef = {
  id: string;
  number: string;
  title: string;
  project: { id: string; title: string } | null;
};

export type ChatConversation = {
  id: string;
  type: "DM" | "PROJECT" | "ESTIMATE";
  title: string | null;
  project: { id: string; title: string; slug: string } | null;
  estimate: EstimateRef | null;
  peer: ChatPeer | null;
  lastMessage: { id: string; body: string; createdAt: string; authorId: string } | null;
  lastMessageAt: string | null;
  unreadCount: number;
};

export type StaffUser = {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  role: string;
};

export const chatKeys = {
  all: ["chat"] as const,
  conversations: () => ["chat", "conversations"] as const,
  conversation: (id: string) => ["chat", "conversation", id] as const,
  messages: (id: string) => ["chat", "conversation", id, "messages"] as const,
  staffUsers: () => ["chat", "users"] as const,
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

export function useConversations() {
  return useQuery({
    queryKey: chatKeys.conversations(),
    queryFn: () =>
      jsonFetch<{ conversations: ChatConversation[] }>("/api/admin/chat/conversations").then(
        (d) => d.conversations
      ),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useUnreadChatCount() {
  const { data } = useConversations();
  return data?.reduce((sum, c) => sum + c.unreadCount, 0) ?? 0;
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: chatKeys.conversation(id ?? ""),
    queryFn: () =>
      jsonFetch<{ conversation: ChatConversation & { participants: { user: ChatPeer }[] } }>(
        `/api/admin/chat/conversations/${id}`
      ).then((d) => d.conversation),
    enabled: !!id,
  });
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: chatKeys.messages(conversationId ?? ""),
    queryFn: () =>
      jsonFetch<{ messages: ChatMessage[]; hasMore: boolean }>(
        `/api/admin/chat/conversations/${conversationId}/messages?limit=50`
      ),
    enabled: !!conversationId,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useStaffUsers() {
  return useQuery({
    queryKey: chatKeys.staffUsers(),
    queryFn: () =>
      jsonFetch<{ users: StaffUser[] }>("/api/admin/chat/users").then((d) => d.users),
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      input:
        | { type: "DM"; userId: string }
        | { type: "PROJECT"; projectId: string }
        | { type: "ESTIMATE"; estimateId: string }
    ) =>
      jsonFetch<{ conversation: { id: string } }>("/api/admin/chat/conversations", {
        method: "POST",
        body: JSON.stringify(input),
      }).then((d) => d.conversation),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.conversations() });
    },
  });
}

export function useToggleMessageReaction(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      jsonFetch<{ reactions: ReactionGroup[] }>(
        `/api/admin/chat/conversations/${conversationId}/messages/${messageId}/reactions`,
        {
          method: "POST",
          body: JSON.stringify({ emoji }),
        }
      ).then((d) => d.reactions),
    onSuccess: (reactions, { messageId }) => {
      qc.setQueryData<{ messages: ChatMessage[]; hasMore: boolean }>(
        chatKeys.messages(conversationId),
        (prev) =>
          prev
            ? {
                ...prev,
                messages: prev.messages.map((m) =>
                  m.id === messageId ? { ...m, reactions } : m
                ),
              }
            : prev
      );
    },
  });
}

export function useSendMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      jsonFetch<{ message: ChatMessage }>(
        `/api/admin/chat/conversations/${conversationId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({ body }),
        }
      ).then((d) => d.message),
    onSuccess: (message) => {
      qc.setQueryData<{ messages: ChatMessage[]; hasMore: boolean }>(
        chatKeys.messages(conversationId),
        (prev) =>
          prev
            ? { ...prev, messages: [...prev.messages, message] }
            : { messages: [message], hasMore: false }
      );
      qc.invalidateQueries({ queryKey: chatKeys.conversations() });
    },
  });
}

export function useMarkRead(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      jsonFetch<{ ok: true }>(`/api/admin/chat/conversations/${conversationId}/read`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.conversations() });
    },
  });
}
