"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Підключає браузер напряму до AssemblyAI Streaming Speech-to-Text.
 *
 * Використання:
 *   const r = useAssemblyRealtime({ meetingId, onFinalText });
 *   r.start(); // => запитує мікрофон + token
 *   r.stop();  // => закриває WS і AudioContext
 *
 * onFinalText викликається лише на FINAL-сегментах (після паузи в мовленні),
 * partial-результати пропускаємо щоб не флудити /analyze.
 *
 * AssemblyAI Streaming чекає аудіо: 16kHz, mono, 16-bit PCM.
 * Перетворюємо у браузері через AudioContext + ScriptProcessor.
 */

type State =
  | "idle"
  | "connecting"
  | "active"
  | "error"
  | "stopping";

export function useAssemblyRealtime(opts: {
  meetingId: string;
  onFinalText: (text: string) => void;
  onError?: (msg: string) => void;
  onStateChange?: (state: State) => void;
}) {
  const [state, setState] = useState<State>("idle");

  const transcriberRef = useRef<{
    close: () => Promise<void>;
    sendAudio: (buf: ArrayBufferLike) => void;
  } | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const updateState = useCallback(
    (s: State) => {
      setState(s);
      opts.onStateChange?.(s);
    },
    [opts],
  );

  const stop = useCallback(async () => {
    updateState("stopping");
    try {
      processorRef.current?.disconnect();
      sourceRef.current?.disconnect();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      await audioCtxRef.current?.close().catch(() => {});
      await transcriberRef.current?.close().catch(() => {});
    } catch {
      /* ignore */
    }
    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    audioCtxRef.current = null;
    transcriberRef.current = null;
    updateState("idle");
  }, [updateState]);

  const start = useCallback(async () => {
    updateState("connecting");
    try {
      // 1. Беремо короткоживучий токен.
      const tokRes = await fetch(
        `/api/admin/meetings/${opts.meetingId}/live-agent/realtime-token`,
        { method: "POST" },
      );
      if (!tokRes.ok) {
        const j = await tokRes.json().catch(() => ({}));
        throw new Error(j.error || "Не вдалось отримати токен");
      }
      const { token } = await tokRes.json();

      // 2. Динамічно імпортуємо SDK (browser entry — без node modules).
      const { RealtimeTranscriber } = await import("assemblyai");
      const transcriber = new RealtimeTranscriber({
        token,
        sampleRate: 16000,
      });

      transcriber.on("transcript.final", (t) => {
        const text = (t.text ?? "").trim();
        if (text) opts.onFinalText(text);
      });
      transcriber.on("error", (err) => {
        console.warn("[Realtime] error:", err);
        opts.onError?.(err.message ?? "Realtime error");
      });
      transcriber.on("close", (code, reason) => {
        console.warn("[Realtime] closed:", code, reason);
      });

      await transcriber.connect();
      transcriberRef.current = transcriber as unknown as typeof transcriberRef.current;

      // 3. Запускаємо мікрофон з 16kHz mono.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) throw new Error("AudioContext недоступний");
      const ctx = new Ctor({ sampleRate: 16000 });
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;

      // ScriptProcessor депрекейтнутий, але достатній для MVP. Розмір 4096
      // балансує latency (256ms) і CPU.
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (ev) => {
        const float32 = ev.inputBuffer.getChannelData(0);
        // Float32 [-1..1] → Int16 PCM
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          const s = Math.max(-1, Math.min(1, float32[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        try {
          transcriberRef.current?.sendAudio(int16.buffer);
        } catch {
          /* ignore — connection might be closing */
        }
      };

      source.connect(processor);
      // Без connect-у на destination ScriptProcessor не отримує onaudioprocess.
      // Робимо silent gain 0 щоб не лунало в колонках.
      const silent = ctx.createGain();
      silent.gain.value = 0;
      processor.connect(silent);
      silent.connect(ctx.destination);

      updateState("active");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Помилка підключення";
      opts.onError?.(msg);
      updateState("error");
      await stop();
    }
  }, [opts, stop, updateState]);

  return { state, start, stop };
}
