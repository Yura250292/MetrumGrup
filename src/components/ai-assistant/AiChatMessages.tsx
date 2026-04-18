"use client";

import { useEffect, useRef } from "react";
import { User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { AiMessageItem } from "@/hooks/useAiChat";
import { AiToolCallIndicator } from "./AiToolCallIndicator";
import { AiAvatar } from "./AiAvatar";
import { AiQuickActions } from "./AiQuickActions";

type Props = {
  messages: AiMessageItem[];
  streamingText: string;
  isStreaming: boolean;
  activeToolCall: string | null;
  onQuickAction?: (prompt: string) => void;
};

export function AiChatMessages({ messages, streamingText, isStreaming, activeToolCall, onQuickAction }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingText]);

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
        <AiAvatar size="lg" />
        <h3 className="text-base md:text-lg font-semibold" style={{ color: T.textPrimary }}>
          AI Помічник Metrum
        </h3>
        <p className="text-center text-mobile-sm md:text-sm max-w-[280px] mb-4" style={{ color: T.textMuted }}>
          Запитайте про проєкти, завдання, фінанси або аналітику.
        </p>
        {onQuickAction && (
          <AiQuickActions onAction={onQuickAction} variant="empty-state" />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 md:gap-4 overflow-y-auto overscroll-contain px-3 md:px-4 py-3 md:py-4">
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
    <div className={`flex gap-2 md:gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {isUser ? (
        <div
          className="flex h-7 w-7 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: T.accentSecondarySoft }}
        >
          <User className="h-3.5 w-3.5 md:h-4 md:w-4" style={{ color: T.accentSecondary }} />
        </div>
      ) : (
        <AiAvatar size="sm" animate={false} />
      )}
      <div
        className={`max-w-[85%] md:max-w-[80%] rounded-2xl px-3 py-2.5 md:px-4 md:py-3 text-mobile-sm md:text-sm leading-relaxed ${
          isUser ? "rounded-tr-md" : "rounded-tl-md"
        }`}
        style={{
          backgroundColor: isUser ? T.accentPrimary + "18" : T.panelElevated,
          color: T.textPrimary,
          border: `1px solid ${T.borderSoft}`,
        }}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        ) : (
          <div className="ai-md break-words">
            <ReactMarkdown
              components={{
                h1: ({ children }) => (
                  <h3 className="mb-2 mt-3 text-base font-bold first:mt-0" style={{ color: T.textPrimary }}>{children}</h3>
                ),
                h2: ({ children }) => (
                  <h4 className="mb-1.5 mt-2.5 text-sm font-bold first:mt-0" style={{ color: T.textPrimary }}>{children}</h4>
                ),
                h3: ({ children }) => (
                  <h5 className="mb-1 mt-2 text-sm font-semibold first:mt-0" style={{ color: T.textPrimary }}>{children}</h5>
                ),
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-0.5 last:mb-0">{children}</ul>,
                ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-0.5 last:mb-0">{children}</ol>,
                li: ({ children }) => <li className="pl-0.5">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                em: ({ children }) => <em className="italic" style={{ color: T.textSecondary }}>{children}</em>,
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 transition-colors hover:opacity-80"
                    style={{ color: T.accentPrimary }}
                  >
                    {children}
                  </a>
                ),
                code: ({ children, className }) => {
                  const isBlock = className?.includes("language-");
                  if (isBlock) {
                    return (
                      <pre
                        className="my-2 overflow-x-auto rounded-lg p-3 text-xs"
                        style={{ backgroundColor: T.panelSoft, border: `1px solid ${T.borderSoft}` }}
                      >
                        <code>{children}</code>
                      </pre>
                    );
                  }
                  return (
                    <code
                      className="rounded px-1 py-0.5 text-xs"
                      style={{ backgroundColor: T.panelSoft, color: T.accentPrimary }}
                    >
                      {children}
                    </code>
                  );
                },
                pre: ({ children }) => <>{children}</>,
                table: ({ children }) => (
                  <div className="my-2 overflow-x-auto rounded-lg" style={{ border: `1px solid ${T.borderSoft}` }}>
                    <table className="w-full text-xs">{children}</table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead style={{ backgroundColor: T.panelSoft }}>{children}</thead>
                ),
                th: ({ children }) => (
                  <th className="px-2.5 py-1.5 text-left font-semibold" style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="px-2.5 py-1.5" style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                    {children}
                  </td>
                ),
                blockquote: ({ children }) => (
                  <blockquote
                    className="my-2 rounded-r-lg py-1 pl-3"
                    style={{
                      borderLeft: `3px solid ${T.accentPrimary}`,
                      backgroundColor: T.accentPrimarySoft,
                      color: T.textSecondary,
                    }}
                  >
                    {children}
                  </blockquote>
                ),
                hr: () => <hr className="my-3" style={{ borderColor: T.borderSoft }} />,
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
