"use client";

import { useCallback, useState } from "react";
import { X, History, ArrowLeft } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { useAiMessages, useAiSendMessage, type AiMessageItem } from "@/hooks/useAiChat";
import { AiChatMessages } from "./AiChatMessages";
import { AiChatComposer } from "./AiChatComposer";
import { AiConversationList } from "./AiConversationList";

type Props = {
  onClose: () => void;
};

export function AiChatPanel({ onClose }: Props) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<AiMessageItem[]>([]);

  const { data: savedMessages } = useAiMessages(conversationId);
  const { send, abort, isStreaming, streamingText, activeToolCall } = useAiSendMessage();

  const messages = conversationId && savedMessages ? savedMessages : optimisticMessages;

  const handleSend = useCallback(
    (message: string) => {
      const userMsg: AiMessageItem = {
        id: "opt-" + Date.now(),
        role: "USER",
        content: message,
        createdAt: new Date().toISOString(),
      };

      if (conversationId) {
        setOptimisticMessages([]);
      } else {
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
    setConversationId(null);
    setOptimisticMessages([]);
    setShowHistory(false);
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    setConversationId(id);
    setOptimisticMessages([]);
    setShowHistory(false);
  }, []);

  // Combine saved + optimistic messages for display
  const displayMessages = [
    ...messages,
    ...(!conversationId ? [] : optimisticMessages),
  ];

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
        className="fixed inset-y-0 right-0 flex w-full flex-col shadow-2xl md:w-[420px]"
        style={{
          zIndex: 9999,
          backgroundColor: T.background,
          borderLeft: `1px solid ${T.borderSoft}`,
        }}
      >
      {/* Header */}
      <div
        className="flex items-center gap-3 border-b px-4 py-3"
        style={{ borderColor: T.borderSoft, backgroundColor: T.panel }}
      >
        {showHistory ? (
          <button
            onClick={() => setShowHistory(false)}
            className="rounded-lg p-1.5 transition-colors hover:opacity-80"
            style={{ color: T.textSecondary }}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : null}

        <div className="flex flex-1 items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{
              background: `linear-gradient(135deg, ${T.accentPrimary}, ${T.accentSecondary})`,
            }}
          >
            <span className="text-sm text-white">AI</span>
          </div>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: T.textPrimary }}>
              {showHistory ? "Історія розмов" : "AI Помічник"}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {!showHistory && (
            <button
              onClick={() => setShowHistory(true)}
              className="rounded-lg p-1.5 transition-colors hover:opacity-80"
              style={{ color: T.textSecondary }}
              title="Історія розмов"
            >
              <History className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors hover:opacity-80"
            style={{ color: T.textSecondary }}
            title="Закрити"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Body */}
      {showHistory ? (
        <AiConversationList
          activeId={conversationId}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
        />
      ) : (
        <>
          <AiChatMessages
            messages={displayMessages}
            streamingText={streamingText}
            isStreaming={isStreaming}
            activeToolCall={activeToolCall}
          />
          <AiChatComposer
            onSend={handleSend}
            onAbort={abort}
            isStreaming={isStreaming}
          />
        </>
      )}
      </div>
    </>
  );
}
