"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Square, Play, Send, RotateCcw } from "lucide-react";

interface Props {
  projects: { id: string; title: string }[];
}

type Phase = "idle" | "recording" | "preview" | "transcribing" | "transcript" | "parsing";

const MAX_SECONDS = 180;

export function VoiceRecorder({ projects }: Props) {
  const router = useRouter();
  const [projectId, setProjectId] = useState<string | null>(
    projects.length === 1 ? projects[0].id : null,
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [audio, setAudio] = useState<{ blob: Blob; url: string; mime: string } | null>(null);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      stopStream();
      if (tickerRef.current) window.clearInterval(tickerRef.current);
      if (audio?.url) URL.revokeObjectURL(audio.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function startRecording() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Браузер не підтримує запис аудіо");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mime = pickMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mime || "audio/webm",
        });
        const url = URL.createObjectURL(blob);
        setAudio({ blob, url, mime: blob.type });
        setPhase("preview");
        stopStream();
        if (tickerRef.current) window.clearInterval(tickerRef.current);
      };

      recorder.start();
      setPhase("recording");
      setSeconds(0);
      tickerRef.current = window.setInterval(() => {
        setSeconds((s) => {
          const next = s + 1;
          if (next >= MAX_SECONDS) recorder.stop();
          return next;
        });
      }, 1000);
    } catch {
      setError("Доступ до мікрофону заборонено");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
  }

  function resetRecording() {
    if (audio?.url) URL.revokeObjectURL(audio.url);
    setAudio(null);
    setSeconds(0);
    setTranscript("");
    setPhase("idle");
  }

  async function transcribe() {
    if (!audio) return;
    setPhase("transcribing");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("audio", audio.blob, "voice." + extOf(audio.mime));
      const res = await fetch("/api/foreman/voice-transcribe", { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { transcript?: string; message?: string; error?: string };
      if (!res.ok) {
        throw new Error(body.message ?? body.error ?? "Не вдалось розпізнати");
      }
      setTranscript(body.transcript ?? "");
      setPhase("transcript");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
      setPhase("preview");
    }
  }

  async function parseAndGo() {
    if (!projectId || !transcript.trim()) return;
    setPhase("parsing");
    setError(null);
    try {
      const res = await fetch("/api/foreman/reports/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          text: transcript.trim(),
          occurredAt: new Date().toISOString(),
          fileKeys: [],
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { reportId?: string; message?: string };
      if (!res.ok || !body.reportId) {
        throw new Error(body.message ?? "Не вдалось зберегти звіт");
      }
      router.push(`/foreman/report/project/${projectId}/review/${body.reportId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
      setPhase("transcript");
    }
  }

  if (projects.length === 0) {
    return (
      <div className="mt-6 rounded-2xl bg-white border border-slate-200 p-6 text-center">
        <div className="text-sm font-semibold text-slate-700">Немає призначень</div>
        <div className="text-xs text-slate-500 mt-1">
          Зверніться до менеджера, щоб призначив вас на об{"’"}єкт.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2">
      {projects.length > 1 && (
        <label className="block">
          <span className="text-[10px] font-extrabold tracking-[0.12em] text-slate-500 uppercase">
            Обʼєкт
          </span>
          <select
            value={projectId ?? ""}
            onChange={(e) => setProjectId(e.target.value || null)}
            className="mt-1 w-full px-3 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 text-[14px] font-medium focus:border-indigo-500 focus:outline-none"
          >
            <option value="">— оберіть —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="rounded-2xl bg-white border border-slate-200 p-6 text-center">
        {phase === "idle" && (
          <>
            <p className="text-[13px] text-slate-600 mb-5 leading-relaxed">
              Натисніть кнопку, продиктуйте витрати (постачальник, матеріал,
              кількість, ціна) — AI розпізнає та підготує звіт.
            </p>
            <RecordButton onClick={startRecording} disabled={!projectId} />
            {!projectId && projects.length > 1 && (
              <div className="mt-3 text-[11px] text-slate-500">Спочатку оберіть обʼєкт</div>
            )}
          </>
        )}

        {phase === "recording" && (
          <>
            <PulsingMic seconds={seconds} />
            <button
              type="button"
              onClick={stopRecording}
              className="mt-6 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-rose-600 text-white font-bold text-[14px] active:scale-95"
            >
              <Square size={16} fill="currentColor" />
              Зупинити запис
            </button>
            <div className="mt-2 text-[11px] text-slate-500">
              макс. {Math.floor(MAX_SECONDS / 60)} хв
            </div>
          </>
        )}

        {phase === "preview" && audio && (
          <>
            <p className="text-[13px] font-semibold text-slate-700 mb-3">
              Тривалість: {formatTime(seconds)}
            </p>
            <audio src={audio.url} controls className="w-full mb-4" />
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={resetRecording}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-semibold text-[13px]"
              >
                <RotateCcw size={14} />
                Перезаписати
              </button>
              <button
                type="button"
                onClick={transcribe}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-[13px]"
              >
                <Play size={14} />
                Розпізнати
              </button>
            </div>
          </>
        )}

        {phase === "transcribing" && (
          <div className="py-6">
            <div className="mx-auto w-10 h-10 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
            <div className="mt-3 text-[13px] font-semibold text-slate-700">
              AI розпізнає голос…
            </div>
          </div>
        )}

        {phase === "transcript" && (
          <div className="text-left">
            <div className="text-[10px] font-extrabold tracking-[0.12em] text-slate-500 uppercase">
              Розпізнаний текст
            </div>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={5}
              className="mt-1 w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-[14px] leading-relaxed focus:border-indigo-500 focus:outline-none resize-y"
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={resetRecording}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-semibold text-[13px]"
              >
                <RotateCcw size={14} />
                Перезаписати
              </button>
              <button
                type="button"
                onClick={parseAndGo}
                disabled={!transcript.trim() || !projectId}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-[13px] disabled:opacity-60"
              >
                <Send size={14} />
                Зберегти і парсити
              </button>
            </div>
          </div>
        )}

        {phase === "parsing" && (
          <div className="py-6">
            <div className="mx-auto w-10 h-10 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
            <div className="mt-3 text-[13px] font-semibold text-slate-700">
              AI готує позиції звіту…
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}

function RecordButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mx-auto w-24 h-24 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-[0_10px_30px_-10px_rgba(245,158,11,0.6)] active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
      aria-label="Почати запис"
    >
      <Mic size={36} strokeWidth={2.2} />
    </button>
  );
}

function PulsingMic({ seconds }: { seconds: number }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-24 h-24">
        <span className="absolute inset-0 rounded-full bg-rose-400/30 animate-ping" />
        <span className="absolute inset-0 rounded-full bg-rose-600 flex items-center justify-center">
          <Mic size={36} className="text-white" strokeWidth={2.4} />
        </span>
      </div>
      <div className="text-[18px] font-bold text-slate-900 tabular-nums">
        {formatTime(seconds)}
      </div>
      <div className="text-[11px] text-slate-500">Запис іде…</div>
    </div>
  );
}

function pickMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

function extOf(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
