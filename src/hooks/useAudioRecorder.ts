"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RecorderState = "idle" | "recording" | "stopped" | "error";

export type RecordedAudio = {
  blob: Blob;
  mimeType: string;
  durationMs: number;
};

const MAX_RECORD_MS = 5 * 60 * 1000; // 5 хвилин для чат-повідомлення
const AUDIO_BITS_PER_SECOND = 32_000;

function pickSupportedMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const mime of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return "audio/webm";
}

export function useAudioRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>("audio/webm");
  const startedAtRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolveStopRef = useRef<((r: RecordedAudio | null) => void) | null>(null);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setElapsedMs(0);

    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Запис аудіо не підтримується у цьому браузері");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickSupportedMimeType();
      mimeRef.current = mimeType;

      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      });
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        clearTimer();
        const finalMs = Date.now() - startedAtRef.current;
        const blob = new Blob(chunksRef.current, { type: mimeRef.current });
        chunksRef.current = [];
        cleanupStream();
        setState("stopped");
        const result: RecordedAudio | null =
          blob.size > 0 ? { blob, mimeType: mimeRef.current, durationMs: finalMs } : null;
        resolveStopRef.current?.(result);
        resolveStopRef.current = null;
      };

      startedAtRef.current = Date.now();
      intervalRef.current = setInterval(() => {
        const ms = Date.now() - startedAtRef.current;
        setElapsedMs(ms);
        if (ms >= MAX_RECORD_MS) {
          try {
            recorder.stop();
          } catch {}
        }
      }, 250);

      recorder.start();
      setState("recording");
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.name === "NotAllowedError"
            ? "Немає дозволу на мікрофон"
            : e.name === "NotFoundError"
              ? "Мікрофон не знайдено"
              : e.message
          : "Не вдалось розпочати запис";
      setError(msg);
      setState("error");
      cleanupStream();
    }
  }, [cleanupStream, clearTimer]);

  const stop = useCallback((): Promise<RecordedAudio | null> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        resolve(null);
        return;
      }
      resolveStopRef.current = resolve;
      try {
        recorder.stop();
      } catch {
        resolveStopRef.current = null;
        cleanupStream();
        clearTimer();
        setState("idle");
        resolve(null);
      }
    });
  }, [cleanupStream, clearTimer]);

  const cancel = useCallback(() => {
    chunksRef.current = [];
    try {
      recorderRef.current?.stop();
    } catch {}
    recorderRef.current = null;
    cleanupStream();
    clearTimer();
    resolveStopRef.current?.(null);
    resolveStopRef.current = null;
    setElapsedMs(0);
    setState("idle");
  }, [cleanupStream, clearTimer]);

  const reset = useCallback(() => {
    setElapsedMs(0);
    setError(null);
    setState("idle");
  }, []);

  // Safety: stop mic on unmount
  useEffect(() => {
    return () => {
      clearTimer();
      cleanupStream();
    };
  }, [cleanupStream, clearTimer]);

  return {
    state,
    elapsedMs,
    error,
    start,
    stop,
    cancel,
    reset,
    maxRecordMs: MAX_RECORD_MS,
  };
}

export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
