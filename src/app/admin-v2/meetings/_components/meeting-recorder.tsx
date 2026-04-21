"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Pause, Play, Upload } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type Props = {
  onReady: (blob: Blob, mimeType: string, durationMs: number) => void;
  disabled?: boolean;
};

type RecState = "idle" | "recording" | "paused" | "stopped";

const MAX_MS = 40 * 60 * 1000;

export function MeetingRecorder({ onReady, disabled }: Props) {
  const [state, setState] = useState<RecState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const pausedOffsetRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  function cleanup() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function startTimer() {
    startedAtRef.current = Date.now() - pausedOffsetRef.current;
    intervalRef.current = setInterval(() => {
      const ms = Date.now() - startedAtRef.current;
      setElapsedMs(ms);
      if (ms >= MAX_MS) {
        stop();
      }
    }, 200);
  }

  function stopTimer() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeCandidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ];
      const mimeType =
        mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ||
        "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stopTimer();
        const finalMs = Date.now() - startedAtRef.current;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        cleanup();
        setState("stopped");
        onReady(blob, mimeType, finalMs);
      };

      recorder.start(1000);
      pausedOffsetRef.current = 0;
      startTimer();
      setState("recording");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Не вдалося отримати доступ до мікрофона";
      setError(message);
      cleanup();
    }
  }

  function pause() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.pause();
      pausedOffsetRef.current = Date.now() - startedAtRef.current;
      stopTimer();
      setState("paused");
    }
  }

  function resume() {
    if (recorderRef.current?.state === "paused") {
      recorderRef.current.resume();
      startTimer();
      setState("recording");
    }
  }

  function stop() {
    if (
      recorderRef.current &&
      (recorderRef.current.state === "recording" ||
        recorderRef.current.state === "paused")
    ) {
      recorderRef.current.stop();
    }
  }

  const mm = Math.floor(elapsedMs / 60000);
  const ss = Math.floor((elapsedMs % 60000) / 1000)
    .toString()
    .padStart(2, "0");

  return (
    <div
      className="rounded-xl p-6"
      style={{
        background: T.panel,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      <div className="flex items-center gap-4">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full"
          style={{
            background:
              state === "recording" ? T.dangerSoft : T.accentPrimarySoft,
            color: state === "recording" ? T.danger : T.accentPrimary,
          }}
        >
          <Mic size={24} />
        </div>
        <div className="flex-1">
          <p
            className="text-sm font-medium"
            style={{ color: T.textPrimary }}
          >
            {state === "idle" && "Готовий до запису"}
            {state === "recording" && "Запис…"}
            {state === "paused" && "Пауза"}
            {state === "stopped" && "Запис завершено"}
          </p>
          <p
            className="font-mono text-2xl font-bold tabular-nums"
            style={{ color: state === "recording" ? T.danger : T.textPrimary }}
          >
            {mm}:{ss}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {state === "idle" && (
            <button
              onClick={start}
              disabled={disabled}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: T.accentPrimary }}
            >
              Почати запис
            </button>
          )}
          {state === "recording" && (
            <>
              <button
                onClick={pause}
                className="rounded-lg p-2"
                style={{
                  background: T.panelElevated,
                  color: T.textSecondary,
                }}
                title="Пауза"
              >
                <Pause size={18} />
              </button>
              <button
                onClick={stop}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
                style={{ background: T.danger }}
              >
                <Square size={16} className="mr-1 inline" /> Зупинити
              </button>
            </>
          )}
          {state === "paused" && (
            <>
              <button
                onClick={resume}
                className="rounded-lg p-2 text-white"
                style={{ background: T.accentPrimary }}
                title="Продовжити"
              >
                <Play size={18} />
              </button>
              <button
                onClick={stop}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
                style={{ background: T.danger }}
              >
                <Square size={16} className="mr-1 inline" /> Зупинити
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-3 text-sm" style={{ color: T.danger }}>
          {error}
        </p>
      )}

      <p className="mt-3 text-xs" style={{ color: T.textMuted }}>
        Максимальна тривалість — 40 хв. Ліміт розміру аудіо для Whisper — 25 MB.
      </p>
    </div>
  );
}

export function MeetingUploader({
  onFile,
  disabled,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File) {
    setError(null);
    if (!file.type.startsWith("audio/")) {
      setError("Оберіть аудіо-файл (mp3, m4a, webm, wav)");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError("Файл завеликий. Максимум 25 MB.");
      return;
    }
    onFile(file);
  }

  return (
    <div
      className="rounded-xl p-6"
      style={{
        background: T.panel,
        border: `1px dashed ${T.borderSoft}`,
      }}
    >
      <div className="flex items-center gap-4">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full"
          style={{ background: T.accentPrimarySoft, color: T.accentPrimary }}
        >
          <Upload size={24} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium" style={{ color: T.textPrimary }}>
            Або завантажте готовий аудіо-файл
          </p>
          <p className="text-xs" style={{ color: T.textMuted }}>
            mp3, m4a, webm, wav — до 25 MB
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
          style={{ background: T.panelElevated, color: T.textPrimary }}
        >
          Обрати файл
        </button>
      </div>
      {error && (
        <p className="mt-3 text-sm" style={{ color: T.danger }}>
          {error}
        </p>
      )}
    </div>
  );
}
