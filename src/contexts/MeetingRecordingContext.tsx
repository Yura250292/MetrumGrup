"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type RecState = "idle" | "recording" | "paused" | "stopped";

export type RecordedAudio = {
  blob: Blob;
  mimeType: string;
  durationMs: number;
};

export const MAX_RECORD_MS = 90 * 60 * 1000;
const AUDIO_BITS_PER_SECOND = 32_000;

type ContextValue = {
  state: RecState;
  elapsedMs: number;
  error: string | null;
  recorded: RecordedAudio | null;
  wakeLockActive: boolean;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  reset: () => void;
};

const NOOP = () => {};

const MeetingRecordingContext = createContext<ContextValue>({
  state: "idle",
  elapsedMs: 0,
  error: null,
  recorded: null,
  wakeLockActive: false,
  start: async () => {},
  pause: NOOP,
  resume: NOOP,
  stop: NOOP,
  reset: NOOP,
});

export function MeetingRecordingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RecState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<RecordedAudio | null>(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>("audio/webm");
  const startedAtRef = useRef<number>(0);
  const pausedOffsetRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const stopTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try {
      await wakeLockRef.current?.release();
    } catch {}
    wakeLockRef.current = null;
    setWakeLockActive(false);
  }, []);

  const acquireWakeLock = useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
        const sentinel: WakeLockSentinel = await navigator.wakeLock.request(
          "screen"
        );
        wakeLockRef.current = sentinel;
        setWakeLockActive(true);
        sentinel.addEventListener("release", () => {
          setWakeLockActive(false);
          wakeLockRef.current = null;
        });
      }
    } catch (e) {
      console.warn("WakeLock acquire failed:", e);
    }
  }, []);

  const startTimer = useCallback(() => {
    startedAtRef.current = Date.now() - pausedOffsetRef.current;
    intervalRef.current = setInterval(() => {
      const ms = Date.now() - startedAtRef.current;
      setElapsedMs(ms);
      if (ms >= MAX_RECORD_MS) {
        // auto-stop on limit
        try {
          recorderRef.current?.stop();
        } catch {}
      }
    }, 500);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setRecorded(null);
    setElapsedMs(0);
    pausedOffsetRef.current = 0;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ];
      const mimeType =
        candidates.find((m) => MediaRecorder.isTypeSupported(m)) || "audio/webm";
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
        stopTimer();
        const finalMs = Date.now() - startedAtRef.current;
        const blob = new Blob(chunksRef.current, { type: mimeRef.current });
        chunksRef.current = [];
        cleanupStream();
        void releaseWakeLock();
        setState("stopped");
        setRecorded({ blob, mimeType: mimeRef.current, durationMs: finalMs });
      };

      // Collect chunks every 3s — limits data loss if tab crashes.
      recorder.start(3000);
      startTimer();
      setState("recording");
      void acquireWakeLock();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Не вдалося отримати доступ до мікрофона";
      setError(message);
      cleanupStream();
    }
  }, [acquireWakeLock, cleanupStream, releaseWakeLock, startTimer, stopTimer]);

  const pause = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.pause();
      pausedOffsetRef.current = Date.now() - startedAtRef.current;
      stopTimer();
      setState("paused");
    }
  }, [stopTimer]);

  const resume = useCallback(() => {
    if (recorderRef.current?.state === "paused") {
      recorderRef.current.resume();
      startTimer();
      setState("recording");
    }
  }, [startTimer]);

  const stop = useCallback(() => {
    const r = recorderRef.current;
    if (r && (r.state === "recording" || r.state === "paused")) {
      r.stop();
    }
  }, []);

  const reset = useCallback(() => {
    setState("idle");
    setElapsedMs(0);
    setRecorded(null);
    setError(null);
    pausedOffsetRef.current = 0;
    chunksRef.current = [];
  }, []);

  // Re-acquire wake lock when tab becomes visible again (Screen Wake Lock API
  // releases it automatically when the page is hidden).
  useEffect(() => {
    function onVisibility() {
      if (
        document.visibilityState === "visible" &&
        (state === "recording" || state === "paused") &&
        !wakeLockRef.current
      ) {
        void acquireWakeLock();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [state, acquireWakeLock]);

  // Warn user before closing tab while recording.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (state === "recording" || state === "paused") {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [state]);

  return (
    <MeetingRecordingContext.Provider
      value={{
        state,
        elapsedMs,
        error,
        recorded,
        wakeLockActive,
        start,
        pause,
        resume,
        stop,
        reset,
      }}
    >
      {children}
    </MeetingRecordingContext.Provider>
  );
}

export function useMeetingRecording() {
  return useContext(MeetingRecordingContext);
}
