"use client";

import { useState } from "react";
import { Mic, Square, X, Loader2 } from "lucide-react";
import { useAudioRecorder, formatElapsed } from "@/hooks/useAudioRecorder";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { ChatAttachmentInput } from "@/hooks/useChat";

type Props = {
  disabled?: boolean;
  onSend: (attachment: ChatAttachmentInput) => Promise<void>;
};

async function uploadAudio(blob: Blob, mimeType: string, durationMs: number): Promise<ChatAttachmentInput> {
  const ext = mimeType.includes("mp4") ? "m4a" : "webm";
  const name = `voice-${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`;
  const file = new File([blob], name, { type: mimeType });

  const presignedRes = await fetch("/api/admin/chat/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      files: [{ name: file.name, type: file.type, size: file.size }],
    }),
  });
  if (!presignedRes.ok) {
    const err = await presignedRes.json().catch(() => ({}));
    throw new Error(err.error || "Не вдалось отримати URL для завантаження");
  }
  const { uploads } = (await presignedRes.json()) as {
    uploads: {
      name: string;
      size: number;
      mimeType: string;
      uploadUrl: string;
      r2Key: string;
      publicUrl: string;
    }[];
  };
  const up = uploads[0];

  const putRes = await fetch(up.uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!putRes.ok) throw new Error(`Помилка завантаження: ${putRes.status}`);

  return {
    name: up.name,
    url: up.publicUrl,
    r2Key: up.r2Key,
    size: up.size,
    mimeType: up.mimeType,
    durationMs,
  };
}

export function AudioRecorderButton({ disabled, onSend }: Props) {
  const recorder = useAudioRecorder();
  const [sending, setSending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const busy = recorder.state === "recording" || sending;

  const handleToggle = async () => {
    if (recorder.state === "idle" || recorder.state === "stopped" || recorder.state === "error") {
      setLocalError(null);
      recorder.reset();
      await recorder.start();
      return;
    }

    if (recorder.state === "recording") {
      // Stop → upload → send
      try {
        setSending(true);
        const result = await recorder.stop();
        if (!result) {
          setLocalError("Запис не зберігся");
          return;
        }
        const attachment = await uploadAudio(result.blob, result.mimeType, result.durationMs);
        await onSend(attachment);
      } catch (e) {
        setLocalError(e instanceof Error ? e.message : "Помилка надсилання");
      } finally {
        setSending(false);
        recorder.reset();
      }
    }
  };

  const handleCancel = () => {
    recorder.cancel();
    setLocalError(null);
  };

  const error = localError || recorder.error;

  if (recorder.state === "recording") {
    return (
      <div
        className="flex items-center gap-2 rounded-lg px-2 py-1"
        style={{
          backgroundColor: T.dangerSoft,
          border: `1px solid ${T.danger}`,
        }}
      >
        <span
          className="inline-block h-2 w-2 rounded-full animate-pulse"
          style={{ backgroundColor: T.danger }}
        />
        <span className="text-xs tabular-nums font-semibold" style={{ color: T.danger }}>
          {formatElapsed(recorder.elapsedMs)}
        </span>
        <button
          type="button"
          onClick={handleCancel}
          disabled={sending}
          className="rounded-full p-0.5 transition active:scale-95 disabled:opacity-50"
          title="Скасувати"
          style={{ color: T.textSecondary }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleToggle}
          disabled={sending}
          className="flex h-7 w-7 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: T.danger, color: "#FFFFFF" }}
          title="Зупинити і надіслати"
        >
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3 w-3 fill-white" />}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled || busy}
        title={error ?? "Записати голосове"}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          color: error ? T.danger : T.textSecondary,
          backgroundColor: "transparent",
        }}
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
      </button>
    </div>
  );
}
