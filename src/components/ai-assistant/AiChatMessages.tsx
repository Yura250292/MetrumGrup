"use client";

import { useEffect, useRef, useState } from "react";
import { User, Copy, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { AiMessageItem } from "@/hooks/useAiChat";
import { AiToolCallIndicator } from "./AiToolCallIndicator";
import { AiAvatar, type AiMood } from "./AiAvatar";
import { AiQuickActions } from "./AiQuickActions";
import { AiInsights } from "./AiInsights";
import { AiInlineChart, parseChartBlocks } from "./AiInlineChart";
import { AiActionCard, parseActionBlocks } from "./AiActionCard";
import { AiFeedback } from "./AiFeedback";

type Props = {
  messages: AiMessageItem[];
  streamingText: string;
  isStreaming: boolean;
  activeToolCall: string | null;
  onQuickAction?: (prompt: string) => void;
  onConfirmAction?: (message: string) => void;
};

export function AiChatMessages({ messages, streamingText, isStreaming, activeToolCall, onQuickAction, onConfirmAction }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingText]);

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex flex-1 flex-col overflow-y-auto overscroll-contain">
        <div className="flex flex-col items-center gap-2 px-6 pt-6 pb-3">
          <AiAvatar size="lg" mood="wave" />
          <h3 className="text-base md:text-lg font-semibold" style={{ color: T.textPrimary }}>
            AI Помічник Metrum
          </h3>
          <p className="text-center text-mobile-sm md:text-sm max-w-[280px]" style={{ color: T.textMuted }}>
            Запитайте або натисніть на інсайт нижче.
          </p>
        </div>
        {/* Proactive insights */}
        {onQuickAction && <AiInsights onAsk={onQuickAction} />}
        {/* Quick actions */}
        <div className="mt-auto pb-3">
          {onQuickAction && <AiQuickActions onAction={onQuickAction} variant="empty-state" />}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 md:gap-4 overflow-y-auto overscroll-contain px-3 md:px-4 py-3 md:py-4">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} onConfirm={onConfirmAction} />
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
              mood="typing"
            />
          )}
          {!streamingText && !activeToolCall && (
            <div className="flex items-center gap-2 px-2">
              <AiAvatar size="sm" mood="thinking" />
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

function MessageBubble({
  message,
  mood = "idle",
  onConfirm,
}: {
  message: AiMessageItem;
  mood?: AiMood;
  onConfirm?: (msg: string) => void;
}) {
  const isUser = message.role === "USER";
  const toolCalls = message.toolCalls;

  return (
    <div className={`flex gap-2 md:gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {isUser ? (
        <div
          className="flex h-7 w-7 md:h-12 md:w-12 shrink-0 items-center justify-center rounded-full md:rounded-xl"
          style={{ backgroundColor: T.accentSecondarySoft }}
        >
          <User className="h-3.5 w-3.5 md:h-6 md:w-6" style={{ color: T.accentSecondary }} />
        </div>
      ) : (
        <AiAvatar size="sm" mood={mood} />
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
            {renderAssistantContent(message.content, onConfirm)}
          </div>
        )}

        {/* Tool transparency + feedback + copy */}
        {!isUser && message.id !== "streaming" && (
          <div className="mt-2 pt-2 flex items-center justify-between gap-2" style={{ borderTop: `1px solid ${T.borderSoft}` }}>
            <div className="flex items-center gap-2 min-w-0">
              {toolCalls && toolCalls.length > 0 && (
                <ToolTransparency tools={toolCalls} />
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <CopyButton text={message.content} />
              {message.id && !message.id.startsWith("opt-") && (
                <AiFeedback messageId={message.id} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function renderAssistantContent(content: string, onConfirm?: (msg: string) => void) {
  // First parse action blocks, then chart blocks, then markdown
  const actionParts = parseActionBlocks(content);
  return actionParts.map((part, i) => {
    if (part.type === "action") {
      return <AiActionCard key={`a-${i}`} actionJson={part.content} onConfirm={onConfirm || (() => {})} />;
    }
    // Parse chart blocks within text
    return parseChartBlocks(part.content).map((block, j) =>
      block.type === "chart" ? (
        <AiInlineChart key={`c-${i}-${j}`} chartJson={block.content} />
      ) : (
        <ReactMarkdownBlock key={`m-${i}-${j}`} content={block.content} />
      ),
    );
  });
}

function ToolTransparency({ tools }: { tools: Array<{ toolName: string; result: unknown }> }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${T.borderSoft}` }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-[10px] font-medium transition-colors"
        style={{ color: T.textMuted }}
      >
        <span>{expanded ? "▾" : "▸"}</span>
        Використано {tools.length} джерел даних
      </button>
      {expanded && (
        <div className="mt-1 flex flex-wrap gap-1">
          {tools.map((t, i) => (
            <span
              key={i}
              className="rounded px-1.5 py-0.5 text-[10px] font-mono"
              style={{ backgroundColor: T.panelSoft, color: T.textMuted }}
            >
              {t.toolName}
              {t.result === "OK" ? " ✓" : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ReactMarkdownBlock({ content }: { content: string }) {
  return (
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
              {content}
            </ReactMarkdown>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="rounded p-0.5 transition-colors hover:opacity-80"
      style={{ color: copied ? T.success : T.textMuted }}
      title="Копіювати"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}
