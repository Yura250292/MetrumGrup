"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

export type AiMessageItem = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  toolCalls?: { toolName: string; input: unknown; result: unknown }[];
  createdAt: string;
};

export type AiConversationItem = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { messages: number };
};

const aiKeys = {
  conversations: ["ai-conversations"] as const,
  conversation: (id: string) => ["ai-conversation", id] as const,
};

export function useAiConversations() {
  return useQuery({
    queryKey: aiKeys.conversations,
    queryFn: async (): Promise<AiConversationItem[]> => {
      const res = await fetch("/api/admin/ai/conversations");
      if (!res.ok) throw new Error("Failed to load conversations");
      const data = await res.json();
      return data.conversations;
    },
  });
}

export function useAiMessages(conversationId: string | null) {
  return useQuery({
    queryKey: aiKeys.conversation(conversationId ?? ""),
    queryFn: async (): Promise<AiMessageItem[]> => {
      if (!conversationId) return [];
      const res = await fetch(`/api/admin/ai/conversations/${conversationId}`);
      if (!res.ok) throw new Error("Failed to load messages");
      const data = await res.json();
      return data.conversation.messages;
    },
    enabled: !!conversationId,
  });
}

export function useDeleteAiConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/ai/conversations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: aiKeys.conversations });
    },
  });
}

export type StreamingState = {
  isStreaming: boolean;
  streamingText: string;
  activeToolCall: string | null;
};

export function useAiSendMessage() {
  const qc = useQueryClient();
  const [streamState, setStreamState] = useState<StreamingState>({
    isStreaming: false,
    streamingText: "",
    activeToolCall: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (opts: {
      message: string;
      conversationId?: string;
      projectId?: string;
      pathname?: string;
      onConversationId?: (id: string) => void;
    }) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStreamState({ isStreaming: true, streamingText: "", activeToolCall: null });

      try {
        const res = await fetch("/api/admin/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: opts.conversationId,
            message: opts.message,
            projectId: opts.projectId,
            pathname: opts.pathname,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Помилка сервера" }));
          throw new Error(err.error || "Помилка");
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              const eventType = line.slice(7).trim();
              const nextLine = lines[lines.indexOf(line) + 1];
              if (!nextLine?.startsWith("data: ")) continue;

              const data = JSON.parse(nextLine.slice(6));

              switch (eventType) {
                case "text":
                  accumulated += data;
                  setStreamState((prev) => ({
                    ...prev,
                    streamingText: accumulated,
                    activeToolCall: null,
                  }));
                  break;
                case "tool_use":
                  setStreamState((prev) => ({
                    ...prev,
                    activeToolCall: data.toolName,
                  }));
                  break;
                case "done":
                  opts.onConversationId?.(data.conversationId);
                  qc.invalidateQueries({ queryKey: aiKeys.conversations });
                  if (data.conversationId) {
                    qc.invalidateQueries({
                      queryKey: aiKeys.conversation(data.conversationId),
                    });
                  }
                  break;
                case "error":
                  throw new Error(data.message);
              }
            }
          }
        }
      } finally {
        setStreamState((prev) => ({ ...prev, isStreaming: false, activeToolCall: null }));
        abortRef.current = null;
      }
    },
    [qc],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { send, abort, ...streamState };
}
