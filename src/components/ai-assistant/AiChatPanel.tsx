"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { X, Plus, MessageSquare, GraduationCap } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { AiAvatar } from "./AiAvatar";
import {
  useAiConversations,
  useAiMessages,
  useAiSendMessage,
  useDeleteAiConversation,
  type AiMessageItem,
} from "@/hooks/useAiChat";
import { AiChatMessages } from "./AiChatMessages";
import { AiChatComposer } from "./AiChatComposer";
import { AiQuickActions } from "./AiQuickActions";
import { TUTORIAL_SCENARIOS } from "./AiTutorial";
import { useAiPanel } from "@/contexts/AiPanelContext";

const MAX_CONVERSATIONS = 5;

type Props = {
  onClose: () => void;
};

export function AiChatPanel({ onClose }: Props) {
  const pathname = usePathname();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [optimisticMessages, setOptimisticMessages] = useState<AiMessageItem[]>([]);
  const [showTutorialMenu, setShowTutorialMenu] = useState(false);
  const { startTutorial } = useAiPanel();

  // Auto-detect projectId from current URL
  const projectId = useMemo(() => {
    const match = pathname.match(/\/projects\/([^/]+)/);
    return match?.[1] ?? undefined;
  }, [pathname]);

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

  // Lock body scroll on mobile when panel is open
  useEffect(() => {
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = orig;
    };
  }, []);

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
        projectId,
        pathname,
        onConversationId: (id) => {
          setConversationId(id);
          setOptimisticMessages([]);
        },
      });
    },
    [conversationId, send],
  );

  const handleNewConversation = useCallback(() => {
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

  const displayMessages = [...messages];

  return (
    <>
      {/* Dim overlay — click to close (mobile only, desktop uses squeeze) */}
      <div
        className="fixed inset-0 md:hidden"
        style={{ zIndex: 9998, backgroundColor: "rgba(0,0,0,0.3)" }}
        onClick={onClose}
      />
      {/* Chat panel — slide in from right */}
      <div
        className="fixed inset-0 flex flex-col md:inset-y-0 md:left-auto md:right-0 md:w-[440px] animate-slide-in-right"
        style={{
          zIndex: 9999,
          backgroundColor: "var(--t-bg, #F8FAFC)",
          borderLeft: `1px solid ${T.borderSoft}`,
        }}
      >
        {/* Header */}
        <div
          className="flex shrink-0 items-center gap-3 px-4 py-2.5 safe-area-pt"
          style={{
            borderBottom: `1px solid ${T.borderSoft}`,
            backgroundColor: T.panel,
          }}
        >
          <div className="flex flex-1 items-center gap-2">
            <AiAvatar size="md" />
            <h2 className="text-sm font-semibold" style={{ color: T.textPrimary }}>
              Помічник
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Tutorial button */}
            <div className="relative">
              <button
                onClick={() => setShowTutorialMenu((v) => !v)}
                className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors active:scale-95 tap-highlight-none"
                style={{ color: T.accentPrimary, backgroundColor: T.accentPrimarySoft }}
                title="Навчання"
              >
                <GraduationCap className="h-4.5 w-4.5" />
              </button>
              {showTutorialMenu && (
                <div
                  className="absolute right-0 top-full mt-1.5 w-56 rounded-xl py-1.5 shadow-xl"
                  style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}`, zIndex: 10 }}
                >
                  <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>
                    Обрати тур
                  </p>
                  {TUTORIAL_SCENARIOS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setShowTutorialMenu(false);
                        startTutorial(s);
                      }}
                      className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:opacity-80"
                    >
                      <span className="text-xs font-medium" style={{ color: T.textPrimary }}>{s.name}</span>
                      <span className="text-[11px]" style={{ color: T.textMuted }}>{s.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors active:scale-95 tap-highlight-none"
              style={{ color: T.textSecondary, backgroundColor: T.panelElevated }}
              title="Закрити"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Conversation tabs — horizontal scroll on mobile */}
        <div
          className="flex shrink-0 items-center gap-1.5 overflow-x-auto px-2 py-1.5 scrollbar-none"
          style={{
            borderBottom: `1px solid ${T.borderSoft}`,
            backgroundColor: T.panel,
            WebkitOverflowScrolling: "touch",
          }}
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
          <button
            onClick={handleNewConversation}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors active:scale-95 tap-highlight-none"
            style={{ color: T.accentPrimary, backgroundColor: T.accentPrimarySoft }}
            title={`Новий чат (макс. ${MAX_CONVERSATIONS})`}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Messages — flex-1 takes remaining space */}
        <AiChatMessages
          messages={displayMessages}
          streamingText={streamingText}
          isStreaming={isStreaming}
          activeToolCall={activeToolCall}
          onQuickAction={handleSend}
          onConfirmAction={handleSend}
        />

        {/* Quick actions above composer when there are messages */}
        {displayMessages.length > 0 && !isStreaming && (
          <AiQuickActions onAction={handleSend} variant="inline" pathname={pathname} />
        )}

        {/* Composer — safe area bottom for notch devices */}
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
  const short = title.length > 18 ? title.slice(0, 16) + "…" : title;

  return (
    <div
      className={`group flex shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition-colors active:scale-95 tap-highlight-none ${
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
        className="ml-0.5 shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-active:opacity-100"
        style={{ color: T.danger }}
        title="Видалити чат"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
