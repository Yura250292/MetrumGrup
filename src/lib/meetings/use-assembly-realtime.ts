"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Підключає браузер напряму до AssemblyAI Universal-Streaming v3.
 *
 * V2 SDK (RealtimeTranscriber) deprecated, тому юзаємо raw WebSocket
 * до wss://streaming.assemblyai.com/v3/ws. Token беремо з нашого
 * /realtime-token endpoint (він робить GET v3/token на сервері).
 *
 * Audio формат: 16kHz mono, 16-bit PCM little-endian.
 *
 * V3 message types:
 *  - Begin   — сесія відкрилась
 *  - Turn    — фрагмент розпізнаного тексту з end_of_turn boolean
 *  - Termination — сесія закрилась
 *
 * onFinalText викликається лише на end_of_turn=true (готова репліка).
 */

type State = "idle" | "connecting" | "active" | "error" | "stopping";

type V3Message =
  | { type: "Begin"; id?: string }
  | {
      type: "Turn";
      transcript?: string;
      end_of_turn?: boolean;
      turn_is_formatted?: boolean;
    }
  | { type: "Termination"; audio_duration_seconds?: number }
  | { type: string; [k: string]: unknown };

export function useAssemblyRealtime(opts: {
  meetingId: string;
  onFinalText: (text: string) => void;
  onError?: (msg: string) => void;
  onStateChange?: (state: State) => void;
}) {
  const [state, setState] = useState<State>("idle");

  const wsRef = useRef<WebSocket | null>(null);
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
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          // V3 graceful close — спецповідомлення "Terminate".
          ws.send(JSON.stringify({ type: "Terminate" }));
        } catch {
          /* ignore */
        }
        ws.close();
      }
    } catch {
      /* ignore */
    }
    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    audioCtxRef.current = null;
    wsRef.current = null;
    updateState("idle");
  }, [updateState]);

  const start = useCallback(async () => {
    updateState("connecting");
    try {
      // 1. Беремо короткоживучий токен з нашого backend (він робить v3/token).
      const tokRes = await fetch(
        `/api/admin/meetings/${opts.meetingId}/live-agent/realtime-token`,
        { method: "POST" },
      );
      if (!tokRes.ok) {
        const j = await tokRes.json().catch(() => ({}));
        throw new Error(j.error || `token HTTP ${tokRes.status}`);
      }
      const { token } = await tokRes.json();
      if (!token) throw new Error("Сервер повернув порожній токен");

      // 2. Відкриваємо WebSocket до v3/ws.
      // Мінімум обовʼязкових параметрів: sample_rate + token. Решта (encoding,
      // turn detection) має дефолти. Раніше передавали format_turns=true —
      // не валідний для v3, через що сервер закривав WS з кодом 3006.
      const wsUrl = `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&encoding=pcm_s16le&token=${encodeURIComponent(
        token,
      )}`;
      const ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";

      // Тримаємо останнє server-side error-повідомлення щоб віддати у onclose.
      let lastErrorReason: string | null = null;

      ws.onmessage = (ev) => {
        if (typeof ev.data !== "string") return;
        let msg: V3Message;
        try {
          msg = JSON.parse(ev.data) as V3Message;
        } catch {
          return;
        }
        if (msg.type === "Turn") {
          // V3 за замовчуванням повертає Turn з end_of_turn boolean.
          const isFinal =
            (msg as { end_of_turn?: boolean }).end_of_turn === true;
          if (!isFinal) return;
          const text = ((msg as { transcript?: string }).transcript ?? "")
            .trim();
          if (text) opts.onFinalText(text);
        } else if (msg.type === "Begin") {
          console.log("[AssemblyAI v3] session started:", msg);
        } else if (msg.type === "Termination") {
          console.log("[AssemblyAI v3] terminated:", msg);
        } else if (msg.type === "Error" || (msg as { error?: string }).error) {
          // Сервер прислав помилку — зберігаємо текст для onclose.
          const errMsg =
            (msg as { message?: string; error?: string }).message ??
            (msg as { error?: string }).error ??
            JSON.stringify(msg);
          console.warn("[AssemblyAI v3] server error:", errMsg);
          lastErrorReason = errMsg;
          opts.onError?.(`AssemblyAI: ${errMsg}`);
        } else {
          console.log("[AssemblyAI v3] unknown msg:", msg);
        }
      };
      ws.onerror = () => {
        opts.onError?.("WebSocket error");
      };
      ws.onclose = (ev) => {
        if (ev.code !== 1000 && ev.code !== 1005) {
          // 3006 — типовий код у AssemblyAI коли акаунт без платного плану /
          // streaming не активований. Дамо конкретне пояснення.
          let msg: string;
          if (ev.code === 3006) {
            msg =
              "AssemblyAI Streaming потребує платний план (free $50 кредитів покриває лише Pre-recorded). Перемкни на «Браузер» або апгрейдь акаунт на assemblyai.com.";
          } else {
            const reason =
              lastErrorReason ?? ev.reason ?? "(reason not provided)";
            msg = `WS closed: code=${ev.code} ${reason}`;
          }
          opts.onError?.(msg);
        }
        if (state === "active") {
          updateState("idle");
        }
      };

      // Чекаємо open перед запуском мікрофона.
      await new Promise<void>((resolve, reject) => {
        const onOpen = () => {
          ws.removeEventListener("open", onOpen);
          ws.removeEventListener("error", onErr);
          resolve();
        };
        const onErr = () => {
          ws.removeEventListener("open", onOpen);
          ws.removeEventListener("error", onErr);
          reject(new Error("WS не зміг відкритись"));
        };
        ws.addEventListener("open", onOpen);
        ws.addEventListener("error", onErr);
      });
      wsRef.current = ws;

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

      // ScriptProcessor депрекейтнутий, але достатній для MVP.
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (ev) => {
        const float32 = ev.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          const s = Math.max(-1, Math.min(1, float32[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        const w = wsRef.current;
        if (w && w.readyState === WebSocket.OPEN) {
          try {
            w.send(int16.buffer);
          } catch {
            /* ignore */
          }
        }
      };

      source.connect(processor);
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
  }, [opts, stop, updateState, state]);

  return { state, start, stop };
}
