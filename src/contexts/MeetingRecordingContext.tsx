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
import fixWebmDuration from "fix-webm-duration";

export type RecState = "idle" | "recording" | "paused" | "stopped";

export type RecordedAudio = {
  blob: Blob;
  mimeType: string;
  durationMs: number;
};

export const MAX_RECORD_MS = 90 * 60 * 1000;
// 96 kbps Opus mono — широко вважається "transparent" для мовлення.
// Раніше було 32 kbps під ліміт OpenAI Whisper (25MB / файл). У AssemblyAI
// ліміт 5GB / 10h, тож можна не економити. На 60 хв ≈ 43 MB.
const AUDIO_BITS_PER_SECOND = 96_000;

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
      // Чітка специфікація аудіо-потоку для максимальної якості розпізнавання:
      // - 48 kHz: нативна частота Opus, без зайвих ресемплів
      // - mono: голосу досить, ½ файлу
      // - echoCancellation/noiseSuppression/autoGainControl: підвищують
      //   точність ASR, особливо в шумних офісах. Браузер сам зробить
      //   найкраще доступне (WebRTC AEC3, RNNoise тощо).
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 48000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
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
      recorder.onstop = async () => {
        stopTimer();
        const finalMs = Date.now() - startedAtRef.current;
        const rawBlob = new Blob(chunksRef.current, {
          type: mimeRef.current,
        });
        chunksRef.current = [];
        cleanupStream();
        void releaseWakeLock();

        // Фіксимо duration в EBML-хедері WebM-blob: MediaRecorder не пише
        // тривалість, через що `<audio>` не вміє seek-ати назад. Файли що
        // юзер завантажує самостійно — мають хедер, тож для них пропускаємо.
        // Для не-webm форматів (mp4) це теж не потрібно.
        //
        // SAFETY: фіксимо тільки якщо finalMs реалістичний (1с..6год) і
        // blob непустий. Якщо щось дивне (вкладка довго була неактивна,
        // мікрофон скинувся) — лишаємо raw blob. Краще без перемотки ніж
        // зламати декодування ін'єкцією неправильної тривалості.
        const SANE_MIN_MS = 1_000;
        const SANE_MAX_MS = 6 * 60 * 60 * 1000;
        let finalBlob = rawBlob;
        const canFix =
          rawBlob.type.includes("webm") &&
          rawBlob.size > 1024 &&
          finalMs >= SANE_MIN_MS &&
          finalMs <= SANE_MAX_MS;
        if (canFix) {
          try {
            finalBlob = await fixWebmDuration(rawBlob, finalMs, {
              logger: false,
            });
          } catch (err) {
            // Якщо фікс не вдався — відкочуємось до сирого blob, краще
            // мати хоч якийсь файл ніж нічого. Перемотка просто не буде
            // працювати, як і раніше.
            console.warn("[meeting-recorder] fixWebmDuration failed:", err);
            finalBlob = rawBlob;
          }
        }

        setState("stopped");
        setRecorded({
          blob: finalBlob,
          mimeType: mimeRef.current,
          durationMs: finalMs,
        });
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
