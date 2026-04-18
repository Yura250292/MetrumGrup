"use client";

import { useEffect, useRef } from "react";
import { Bot, User } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { AiMessageItem } from "@/hooks/useAiChat";
import { AiToolCallIndicator } from "./AiToolCallIndicator";

type Props = {
  messages: AiMessageItem[];
  streamingText: string;
  isStreaming: boolean;
  activeToolCall: string | null;
};

export function AiChatMessages({ messages, streamingText, isStreaming, activeToolCall }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingText]);

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ backgroundColor: T.accentPrimarySoft }}
        >
          <Bot className="h-8 w-8" style={{ color: T.accentPrimary }} />
        </div>
        <h3 className="text-lg font-semibold" style={{ color: T.textPrimary }}>
          AI Помічник Metrum
        </h3>
        <p className="text-center text-sm" style={{ color: T.textMuted }}>
          Запитайте про проєкти, завдання, фінанси або аналітику.
          Я допоможу знайти потрібну інформацію.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

      {isStreaming && (
        <>
          {activeToolCall && <AiToolCallIndicator toolName={activeToolCall} />}
          {streamingText && (
            <MessageBubble
              message={{
                id: "streaming",
                role: "ASSISTANT",
                content: streamingText,
                createdAt: new Date().toISOString(),
              }}
            />
          )}
          {!streamingText && !activeToolCall && (
            <div className="flex items-center gap-2 px-2">
              <div className="flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full" style={{ backgroundColor: T.accentPrimary, animationDelay: "0ms" }} />
                <span className="h-2 w-2 animate-bounce rounded-full" style={{ backgroundColor: T.accentPrimary, animationDelay: "150ms" }} />
                <span className="h-2 w-2 animate-bounce rounded-full" style={{ backgroundColor: T.accentPrimary, animationDelay: "300ms" }} />
              </div>
            </div>
          )}
        </>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

function MessageBubble({ message }: { message: AiMessageItem }) {
  const isUser = message.role === "USER";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{
          backgroundColor: isUser ? T.accentSecondarySoft : T.accentPrimarySoft,
        }}
      >
        {isUser ? (
          <User className="h-4 w-4" style={{ color: T.accentSecondary }} />
        ) : (
          <Bot className="h-4 w-4" style={{ color: T.accentPrimary }} />
        )}
      </div>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser ? "rounded-tr-md" : "rounded-tl-md"
        }`}
        style={{
          backgroundColor: isUser ? T.accentPrimary + "18" : T.panelElevated,
          color: T.textPrimary,
          border: `1px solid ${T.borderSoft}`,
        }}
      >
        <div className="ai-markdown whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </div>
    </div>
  );
}
