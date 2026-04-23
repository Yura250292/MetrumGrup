"use client";

import { useState } from "react";
import { Bot, X } from "lucide-react";
import { useSendMessage, type ChatAttachmentInput } from "@/hooks/useChat";
import { CommentComposer } from "@/components/collab/CommentComposer";
import { AudioRecorderButton } from "./AudioRecorderButton";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type StructuredTask = {
  title: string;
  priority: "P1" | "P2" | "P3";
  assigneeName: string | null;
  notes: string | null;
};

const PRIORITY_EMOJI: Record<StructuredTask["priority"], string> = {
  P1: "🔴",
  P2: "🟡",
  P3: "🔵",
};

function tasksToMarkdown(tasks: StructuredTask[]): string {
  const lines = ["📋 **Задачі:**"];
  for (const t of tasks) {
    const who = t.assigneeName ? ` — @${t.assigneeName}` : "";
    const notes = t.notes ? ` · _${t.notes}_` : "";
    lines.push(`- ${PRIORITY_EMOJI[t.priority]} **[${t.priority}]** ${t.title}${who}${notes}`);
  }
  return lines.join("\n");
}

export function MessageComposer({ conversationId }: { conversationId: string }) {
  const sendMessage = useSendMessage(conversationId);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [taskLoading, setTaskLoading] = useState(false);
  const [assistantMode, setAssistantMode] = useState(false);

  const sendAudioAttachment = async (attachment: ChatAttachmentInput) => {
    await sendMessage.mutateAsync({ body: "", attachments: [attachment] });
  };

  const handleSubmit = async (body: string, attachments?: ChatAttachmentInput[]) => {
    let trimmed = body.trim();

    // Assistant mode: prepend "@ai " if not already tagged so handleAiMention
    // fires on the server side. Disable the mode once the message is sent.
    if (assistantMode && trimmed && !/(^|\s)@ai\b/i.test(trimmed)) {
      trimmed = `@ai ${trimmed}`;
    }

    // /task handler — replace the draft with a structured task list.
    if (trimmed.toLowerCase().startsWith("/task ")) {
      const text = trimmed.slice(6).trim();
      if (!text) {
        setTaskError("Після /task вкажіть текст для структуризації");
        return;
      }
      try {
        setTaskLoading(true);
        setTaskError(null);
        const res = await fetch("/api/admin/chat/ai/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, text }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "Не вдалось структурувати задачі");
        }
        const { tasks } = (await res.json()) as { tasks: StructuredTask[] };
        if (!tasks.length) {
          setTaskError("AI не знайшов задач у тексті");
          return;
        }
        await sendMessage.mutateAsync({
          body: tasksToMarkdown(tasks),
          attachments: attachments?.map((a) => ({
            name: a.name,
            url: a.url,
            r2Key: a.r2Key,
            size: a.size,
            mimeType: a.mimeType,
          })),
        });
        if (assistantMode) setAssistantMode(false);
      } catch (e) {
        setTaskError(e instanceof Error ? e.message : "Помилка /task");
      } finally {
        setTaskLoading(false);
      }
      return;
    }

    setTaskError(null);
    await sendMessage.mutateAsync({
      body: trimmed,
      attachments: attachments?.map((a) => ({
        name: a.name,
        url: a.url,
        r2Key: a.r2Key,
        size: a.size,
        mimeType: a.mimeType,
      })),
    });
    if (assistantMode) setAssistantMode(false);
  };

  const busy = sendMessage.isPending || taskLoading;

  return (
    <div
      className="border-t px-4 py-3 transition-colors"
      style={{
        borderColor: assistantMode ? "rgba(236, 72, 153, 0.45)" : T.borderSoft,
        backgroundColor: assistantMode ? "rgba(236, 72, 153, 0.05)" : "transparent",
      }}
    >
      {assistantMode && (
        <div
          className="flex items-center justify-between gap-2 mb-2 rounded-lg px-3 py-1.5 text-[12px]"
          style={{
            backgroundColor: "rgba(236, 72, 153, 0.12)",
            color: "#db2777",
            border: "1px solid rgba(236, 72, 153, 0.25)",
          }}
        >
          <span className="flex items-center gap-1.5 font-medium">
            <Bot className="h-3.5 w-3.5" />
            Запит до AI — побачать всі учасники чату
          </span>
          <button
            type="button"
            onClick={() => setAssistantMode(false)}
            disabled={busy}
            className="rounded-md p-0.5 transition active:scale-95 disabled:opacity-50"
            title="Вимкнути AI-режим"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <CommentComposer
            onSubmit={handleSubmit}
            isPending={busy}
            placeholder={
              assistantMode
                ? "Запит до AI-помічника… (можна просити проаналізувати файли вище)"
                : "Повідомлення… (@ — згадати, @ai — запит, /task — структура задач)"
            }
            uploadEndpoint="/api/admin/chat/upload-url"
            aiComposeEndpoint="/api/admin/chat/ai/compose"
          />
        </div>
        <div className="pb-[2px] flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAssistantMode((v) => !v)}
            disabled={busy}
            title={assistantMode ? "Вимкнути AI-режим" : "Звернутись до помічника"}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={
              assistantMode
                ? {
                    backgroundColor: "#ec4899",
                    color: "#FFFFFF",
                  }
                : {
                    backgroundColor: "transparent",
                    color: T.textSecondary,
                  }
            }
          >
            <Bot className="h-4 w-4" />
          </button>
          <AudioRecorderButton
            disabled={busy}
            onSend={sendAudioAttachment}
          />
        </div>
      </div>
      {taskError && (
        <p className="mt-1 text-xs text-red-500">{taskError}</p>
      )}
      {!taskError && sendMessage.isError && (
        <p className="mt-1 text-xs text-red-500">
          Не вдалося надіслати: {(sendMessage.error as Error)?.message}
        </p>
      )}
    </div>
  );
}
