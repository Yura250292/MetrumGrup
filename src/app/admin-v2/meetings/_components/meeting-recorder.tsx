"use client";

import { useRef, useState } from "react";
import { Mic, Square, Pause, Play, Upload, ShieldCheck } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { useMeetingRecording } from "@/contexts/MeetingRecordingContext";

export function MeetingRecorder() {
  const { state, elapsedMs, error, wakeLockActive, start, pause, resume, stop } =
    useMeetingRecording();

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
          {(state === "idle" || state === "stopped") && (
            <button
              onClick={() => void start()}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
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

      {(state === "recording" || state === "paused") && (
        <div
          className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
          style={{
            background: wakeLockActive ? T.successSoft : T.warningSoft,
            color: wakeLockActive ? T.success : T.warning,
          }}
        >
          <ShieldCheck size={14} />
          {wakeLockActive
            ? "Екран не згасне. Можна переключатись на інші сторінки — запис триватиме."
            : "Wake Lock недоступний у цьому браузері. Не вимикайте екран і не перемикайтесь на інші додатки."}
        </div>
      )}

      <p className="mt-3 text-xs" style={{ color: T.textMuted }}>
        Максимальна тривалість — 90 хв. Запис стиснуто у 32 кбіт/с opus
        (оптимально для мовлення і Whisper).
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
            mp3, m4a, webm, wav — до 25 MB для AI-розпізнавання
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
