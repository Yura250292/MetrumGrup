"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, Globe, X } from "lucide-react";
import { chatKeys, useSendMessage, type ChatAttachmentInput } from "@/hooks/useChat";
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

type AiModelChoice =
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gemini-2.5-flash"
  | "claude-opus-4-7"
  | "claude-sonnet-4-6";

const AI_MODEL_LABELS: Record<AiModelChoice, string> = {
  "claude-opus-4-7": "Claude Opus 4.7",
  "claude-sonnet-4-6": "Claude Sonnet 4.6",
  "gpt-4o": "GPT-4o",
  "gpt-4o-mini": "GPT-4o mini",
  "gemini-2.5-flash": "Gemini 2.5 Flash",
};

const AI_MODEL_KEYS: AiModelChoice[] = [
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "gpt-4o",
  "gpt-4o-mini",
  "gemini-2.5-flash",
];

function isValidAiModel(v: string): v is AiModelChoice {
  return (AI_MODEL_KEYS as string[]).includes(v);
}

function loadAiModel(): AiModelChoice {
  if (typeof window === "undefined") return "gpt-4o";
  const v = window.localStorage.getItem("metrum:chat:aiModel");
  return v && isValidAiModel(v) ? v : "gpt-4o";
}

export function MessageComposer({ conversationId }: { conversationId: string }) {
  const sendMessage = useSendMessage(conversationId);
  const qc = useQueryClient();
  const [taskError, setTaskError] = useState<string | null>(null);
  const [taskLoading, setTaskLoading] = useState(false);
  const [assistantMode, setAssistantMode] = useState(false);
  const [aiModel, setAiModelState] = useState<AiModelChoice>("gpt-4o");
  const [aiInvokeLoading, setAiInvokeLoading] = useState(false);

  // Load saved model after mount (avoids SSR hydration mismatch).
  if (typeof window !== "undefined" && aiModel === "gpt-4o") {
    const saved = loadAiModel();
    if (saved !== aiModel) setAiModelState(saved);
  }

  const setAiModel = (v: AiModelChoice) => {
    setAiModelState(v);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("metrum:chat:aiModel", v);
    }
  };

  const sendAudioAttachment = async (attachment: ChatAttachmentInput) => {
    await sendMessage.mutateAsync({ body: "", attachments: [attachment] });
  };

  const handleSubmit = async (body: string, attachments?: ChatAttachmentInput[]) => {
    const trimmed = body.trim();

    // Assistant mode: route to /ai-invoke with the selected model. This
    // endpoint publishes both the user prompt and the AI reply, so the
    // selected model is honoured instead of the default.
    if (assistantMode) {
      if (!trimmed) return;
      try {
        setAiInvokeLoading(true);
        setTaskError(null);
        const res = await fetch(
          `/api/admin/chat/conversations/${conversationId}/ai-invoke`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: trimmed, model: aiModel }),
          },
        );
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "Не вдалось запустити AI");
        }
        await qc.invalidateQueries({ queryKey: chatKeys.messages(conversationId) });
        await qc.invalidateQueries({ queryKey: chatKeys.conversations() });
        setAssistantMode(false);
      } catch (e) {
        setTaskError(e instanceof Error ? e.message : "Помилка AI-режиму");
      } finally {
        setAiInvokeLoading(false);
      }
      return;
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

  const busy = sendMessage.isPending || taskLoading || aiInvokeLoading;

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
            {aiModel === "gemini-2.5-flash" && (
              <span
                className="inline-flex items-center gap-0.5 ml-1 rounded px-1 py-0.5 text-[10px] font-semibold"
                style={{ backgroundColor: "rgba(236, 72, 153, 0.2)" }}
                title="Gemini з доступом до Google Search"
              >
                <Globe className="h-2.5 w-2.5" />
                web
              </span>
            )}
          </span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-[11px]">
              <span className="opacity-70">Модель:</span>
              <select
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value as AiModelChoice)}
                disabled={busy}
                className="rounded-md px-1.5 py-0.5 text-[11px] outline-none"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.6)",
                  color: "#831843",
                  border: "1px solid rgba(236, 72, 153, 0.35)",
                }}
              >
                {AI_MODEL_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {AI_MODEL_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
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
            rows={4}
            maxHeightClass="max-h-64"
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
