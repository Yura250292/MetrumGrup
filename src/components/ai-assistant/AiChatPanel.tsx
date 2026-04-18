"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Plus, Trash2, MessageSquare } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  useAiConversations,
  useAiMessages,
  useAiSendMessage,
  useDeleteAiConversation,
  type AiMessageItem,
} from "@/hooks/useAiChat";
import { AiChatMessages } from "./AiChatMessages";
import { AiChatComposer } from "./AiChatComposer";

const MAX_CONVERSATIONS = 5;

type Props = {
  onClose: () => void;
};

export function AiChatPanel({ onClose }: Props) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [optimisticMessages, setOptimisticMessages] = useState<AiMessageItem[]>([]);

  const { data: conversations } = useAiConversations();
  const { data: savedMessages } = useAiMessages(conversationId);
  const { send, abort, isStreaming, streamingText, activeToolCall } = useAiSendMessage();
  const deleteMutation = useDeleteAiConversation();

  // Auto-select first conversation on load
  useEffect(() => {
    if (!conversationId && conversations && conversations.length > 0) {
      setConversationId(conversations[0].id);
    }
  }, [conversations, conversationId]);

  const messages = conversationId && savedMessages ? savedMessages : optimisticMessages;

  const handleSend = useCallback(
    (message: string) => {
      const userMsg: AiMessageItem = {
        id: "opt-" + Date.now(),
        role: "USER",
        content: message,
        createdAt: new Date().toISOString(),
      };

      if (!conversationId) {
        setOptimisticMessages((prev) => [...prev, userMsg]);
      }

      send({
        message,
        conversationId: conversationId ?? undefined,
        onConversationId: (id) => {
          setConversationId(id);
          setOptimisticMessages([]);
        },
      });
    },
    [conversationId, send],
  );

  const handleNewConversation = useCallback(() => {
    // Enforce max 5 — delete oldest if at limit
    if (conversations && conversations.length >= MAX_CONVERSATIONS) {
      const oldest = conversations[conversations.length - 1];
      deleteMutation.mutate(oldest.id);
    }
    setConversationId(null);
    setOptimisticMessages([]);
  }, [conversations, deleteMutation]);

  const handleSelectConversation = useCallback((id: string) => {
    setConversationId(id);
    setOptimisticMessages([]);
  }, []);

  const handleDeleteConversation = useCallback(
    (id: string) => {
      deleteMutation.mutate(id);
      if (conversationId === id) {
        const remaining = conversations?.filter((c) => c.id !== id);
        setConversationId(remaining?.[0]?.id ?? null);
        setOptimisticMessages([]);
      }
    },
    [conversationId, conversations, deleteMutation],
  );

  const displayMessages = [
    ...messages,
    ...(!conversationId ? [] : []),
  ];

  const canCreateNew =
    !conversations || conversations.length < MAX_CONVERSATIONS || true; // always allow — we auto-delete oldest

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm"
        style={{ zIndex: 9998 }}
        onClick={onClose}
      />
      {/* Chat panel */}
      <div
        className="fixed inset-y-0 right-0 flex w-full flex-col shadow-2xl md:w-[440px]"
        style={{
          zIndex: 9999,
          backgroundColor: "var(--t-bg, #F8FAFC)",
          borderLeft: `1px solid ${T.borderSoft}`,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 border-b px-4 py-2.5"
          style={{ borderColor: T.borderSoft, backgroundColor: T.panel }}
        >
          <div className="flex flex-1 items-center gap-2">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{
                background: `linear-gradient(135deg, ${T.accentPrimary}, ${T.accentSecondary})`,
              }}
            >
              <span className="text-xs font-bold text-white">AI</span>
            </div>
            <h2 className="text-sm font-semibold" style={{ color: T.textPrimary }}>
              Помічник
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors hover:opacity-80"
            style={{ color: T.textSecondary }}
            title="Закрити"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Conversation tabs */}
        <div
          className="flex items-center gap-1 overflow-x-auto border-b px-2 py-1.5"
          style={{ borderColor: T.borderSoft, backgroundColor: T.panel }}
        >
          {conversations?.map((conv) => (
            <ConversationTab
              key={conv.id}
              title={conv.title || "Чат"}
              isActive={conv.id === conversationId}
              onSelect={() => handleSelectConversation(conv.id)}
              onDelete={() => handleDeleteConversation(conv.id)}
            />
          ))}
          {/* New conversation button */}
          <button
            onClick={handleNewConversation}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:opacity-80"
            style={{ color: T.accentPrimary, backgroundColor: T.accentPrimarySoft }}
            title={`Новий чат (макс. ${MAX_CONVERSATIONS})`}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Messages */}
        <AiChatMessages
          messages={displayMessages}
          streamingText={streamingText}
          isStreaming={isStreaming}
          activeToolCall={activeToolCall}
        />

        {/* Composer */}
        <AiChatComposer
          onSend={handleSend}
          onAbort={abort}
          isStreaming={isStreaming}
        />
      </div>
    </>
  );
}

function ConversationTab({
  title,
  isActive,
  onSelect,
  onDelete,
}: {
  title: string;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  // Truncate title to ~15 chars
  const short = title.length > 18 ? title.slice(0, 16) + "…" : title;

  return (
    <div
      className={`group flex shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
        isActive ? "font-semibold" : ""
      }`}
      style={{
        backgroundColor: isActive ? T.accentPrimarySoft : "transparent",
        color: isActive ? T.accentPrimary : T.textSecondary,
        border: isActive ? `1px solid ${T.accentPrimary}30` : "1px solid transparent",
      }}
      onClick={onSelect}
    >
      <MessageSquare className="h-3 w-3 shrink-0" />
      <span className="max-w-[100px] truncate">{short}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="ml-0.5 hidden shrink-0 rounded p-0.5 transition-colors hover:opacity-80 group-hover:block"
        style={{ color: T.danger }}
        title="Видалити чат"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
