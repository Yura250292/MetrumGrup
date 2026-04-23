"use client";

import { useState } from "react";
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

  const sendAudioAttachment = async (attachment: ChatAttachmentInput) => {
    await sendMessage.mutateAsync({ body: "", attachments: [attachment] });
  };

  const handleSubmit = async (body: string, attachments?: ChatAttachmentInput[]) => {
    const trimmed = body.trim();

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
      } catch (e) {
        setTaskError(e instanceof Error ? e.message : "Помилка /task");
      } finally {
        setTaskLoading(false);
      }
      return;
    }

    setTaskError(null);
    await sendMessage.mutateAsync({
      body,
      attachments: attachments?.map((a) => ({
        name: a.name,
        url: a.url,
        r2Key: a.r2Key,
        size: a.size,
        mimeType: a.mimeType,
      })),
    });
  };

  return (
    <div
      className="border-t px-4 py-3"
      style={{ borderColor: T.borderSoft }}
    >
      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <CommentComposer
            onSubmit={handleSubmit}
            isPending={sendMessage.isPending || taskLoading}
            placeholder="Повідомлення… (@ — згадати, @ai — запит, /task — структура задач)"
            uploadEndpoint="/api/admin/chat/upload-url"
            aiComposeEndpoint="/api/admin/chat/ai/compose"
          />
        </div>
        <div className="pb-[2px]">
          <AudioRecorderButton
            disabled={sendMessage.isPending || taskLoading}
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
