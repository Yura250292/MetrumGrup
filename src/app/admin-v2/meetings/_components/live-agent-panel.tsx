"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Pause,
  Play,
  Pin,
  PinOff,
  Trash2,
  Filter as FilterIcon,
  Loader2,
  AlertTriangle,
  Sparkles,
  CircleDollarSign,
  AlertCircle,
  Zap,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { useAssemblyRealtime } from "@/lib/meetings/use-assembly-realtime";

type TranscribeMode = "browser" | "assemblyai";

// ────────────────────────────────────────────────────────────────────────
// Live AI Agent Panel
//
// Окремий бічний блок на сторінці наради. НЕ ламає основний запис: коли
// агент вимкнений — нічого не викликає. Коли увімкнений:
//  1. Запускає браузерну SpeechRecognition (on-device, безкоштовно).
//  2. Буферизує final-результати у chunk-и ~500-1200 симв або 30 сек.
//  3. Шле POST /analyze з chunk + recentContext + previousInsights.
//  4. Виводить отримані insights у списку з фільтрами.
//
// Якщо браузер не підтримує SpeechRecognition (не Chromium / не Safari) —
// показуємо warning, агент не запускається.
// ────────────────────────────────────────────────────────────────────────

export type LiveInsightDTO = {
  id: string;
  category: string;
  priority: string;
  title: string;
  summary: string;
  suggestedQuestion: string | null;
  actionItem: string | null;
  confidence: number | null;
  isPinned: boolean;
  isHidden: boolean;
  createdAt: string;
};

type CostSummary = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number | string;
};

const CATEGORY_LABELS: Record<string, string> = {
  legal_risk: "Юрид. ризик",
  financial_risk: "Фін. ризик",
  construction_risk: "Будівельний ризик",
  deadline_risk: "Строки",
  missing_information: "Бракує інформації",
  suggested_question: "Питання",
  action_item: "Задача",
  important_decision: "Рішення",
  contract_related: "Договір",
  estimate_related: "Кошторис",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

function categoryStyle(c: string): { bg: string; fg: string } {
  if (c === "legal_risk" || c === "contract_related")
    return { bg: T.dangerSoft, fg: T.danger };
  if (c === "financial_risk" || c === "estimate_related")
    return { bg: "#16A34A20", fg: "#15803D" };
  if (c === "construction_risk")
    return { bg: T.amberSoft, fg: T.amber };
  if (c === "deadline_risk")
    return { bg: T.amberSoft, fg: T.amber };
  if (c === "suggested_question")
    return { bg: T.accentPrimarySoft, fg: T.accentPrimary };
  if (c === "action_item")
    return { bg: T.successSoft, fg: T.success };
  if (c === "important_decision")
    return { bg: T.indigoSoft, fg: T.indigo };
  return { bg: T.panelElevated, fg: T.textSecondary };
}

function priorityStyle(p: string): { bg: string; fg: string } {
  if (p === "critical") return { bg: T.danger, fg: "#fff" };
  if (p === "high") return { bg: T.dangerSoft, fg: T.danger };
  if (p === "medium") return { bg: T.amberSoft, fg: T.amber };
  return { bg: T.panelElevated, fg: T.textMuted };
}

const CHUNK_MIN_CHARS = 500;
const CHUNK_FLUSH_INTERVAL_MS = 30_000;
const CONTEXT_WINDOW_CHARS = 4000;

export function LiveAgentPanel({ meetingId }: { meetingId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<TranscribeMode>("browser");
  const [supported, setSupported] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string>("Вимкнено");
  const [busy, setBusy] = useState(false);
  const [insights, setInsights] = useState<LiveInsightDTO[]>([]);
  const [cost, setCost] = useState<CostSummary | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterPriority, setFilterPriority] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<unknown>(null);
  const bufferRef = useRef<string>("");
  const recentContextRef = useRef<string>("");
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendingRef = useRef(false);
  const startedAtRef = useRef<number>(0);

  // AssemblyAI Realtime hook — підключається коли mode="assemblyai".
  const realtime = useAssemblyRealtime({
    meetingId,
    onFinalText: (text) => {
      bufferRef.current += " " + text;
      if (bufferRef.current.length >= CHUNK_MIN_CHARS) void flush();
    },
    onError: (msg) => setError(`AssemblyAI Realtime: ${msg}`),
    onStateChange: (s) => {
      if (s === "connecting")
        setStatusMessage("Підключення до AssemblyAI…");
      else if (s === "active") setStatusMessage("Активний — AssemblyAI Realtime");
      else if (s === "error") setStatusMessage("Помилка AssemblyAI");
    },
  });

  // Refresh insights from DB on mount + after each analyze.
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  async function refresh() {
    try {
      const res = await fetch(
        `/api/admin/meetings/${meetingId}/live-agent/insights`,
      );
      if (!res.ok) return;
      const data = await res.json();
      setInsights(data.insights ?? []);
      setCost(data.cost ?? null);
    } catch {
      /* ignore */
    }
  }

  // Detect browser support on mount.
  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: unknown;
      webkitSpeechRecognition?: unknown;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    setSupported(!!Ctor);
  }, []);

  async function start() {
    setError(null);
    bufferRef.current = "";
    startedAtRef.current = Date.now();
    enabledRef.current = true;
    setEnabled(true);

    // Спільний flush-таймер незалежно від режиму.
    flushTimerRef.current = setInterval(() => {
      if (bufferRef.current.trim().length >= 200) void flush();
    }, CHUNK_FLUSH_INTERVAL_MS);

    if (mode === "assemblyai") {
      await realtime.start();
      return;
    }

    // mode === "browser" — Web Speech API
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setError("Браузер не підтримує розпізнавання мовлення");
      setSupported(false);
      enabledRef.current = false;
      setEnabled(false);
      return;
    }
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "uk-UA";

    rec.onresult = (event: SpeechRecognitionEventLike) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal && r[0]?.transcript) {
          bufferRef.current += " " + r[0].transcript.trim();
          if (bufferRef.current.length >= CHUNK_MIN_CHARS) {
            void flush();
          }
        }
      }
    };
    rec.onerror = (ev: SpeechRecognitionErrorLike) => {
      console.warn("[LiveAgent] SpeechRecognition error:", ev.error);
      // Не вимикаємо повністю — тимчасова помилка, спробуємо переавтостарт.
      if (
        ev.error === "no-speech" ||
        ev.error === "audio-capture" ||
        ev.error === "network"
      ) {
        setStatusMessage(`Помилка: ${ev.error} — переспроба`);
        try {
          rec.stop();
        } catch {
          /* ignore */
        }
      } else {
        setError(`SpeechRecognition: ${ev.error}`);
      }
    };
    rec.onend = () => {
      // Якщо все ще активні — авто-перезапуск.
      if (recognitionRef.current === rec && enabledRef.current) {
        try {
          rec.start();
          setStatusMessage("Активний — слухає");
        } catch {
          /* ignore */
        }
      }
    };

    try {
      rec.start();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не вдалось запустити мікрофон",
      );
      enabledRef.current = false;
      setEnabled(false);
      return;
    }
    recognitionRef.current = rec;
    setStatusMessage("Активний — слухає (browser)");
  }

  async function stop() {
    enabledRef.current = false;
    setEnabled(false);
    setStatusMessage("Вимкнено");
    if (mode === "assemblyai") {
      await realtime.stop();
    } else {
      const rec = recognitionRef.current as
        | { stop?: () => void }
        | null;
      try {
        rec?.stop?.();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    }
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    // Останній flush.
    if (bufferRef.current.trim().length >= 200) void flush();
  }

  // Reflects `enabled` state synchronously для onresult/onend без race-ів.
  const enabledRef = useRef(false);

  async function flush() {
    if (sendingRef.current) return;
    const chunk = bufferRef.current.trim();
    if (chunk.length < 100) return;
    bufferRef.current = "";
    sendingRef.current = true;
    setStatusMessage("Аналізує…");
    setBusy(true);

    const sourceStartMs = Math.max(0, Date.now() - startedAtRef.current);
    const recentContext = recentContextRef.current;
    const previousInsights = insights.slice(0, 10).map((i) => ({
      title: i.title,
      category: i.category,
      priority: i.priority,
    }));

    try {
      const res = await fetch(
        `/api/admin/meetings/${meetingId}/live-agent/analyze`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currentChunk: chunk,
            recentContext: recentContext || null,
            previousInsights,
            sourceStartMs,
            sourceEndMs: Date.now() - startedAtRef.current,
          }),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      // Зрушуємо контекст: тримаємо вікно з останнього chunk + попередніх.
      recentContextRef.current = (
        recentContext +
        "\n" +
        chunk
      ).slice(-CONTEXT_WINDOW_CHARS);
      await refresh();
      setStatusMessage(enabledRef.current ? "Активний — слухає" : "Вимкнено");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка аналізу");
      setStatusMessage("Помилка API");
    } finally {
      sendingRef.current = false;
      setBusy(false);
    }
  }

  async function togglePin(i: LiveInsightDTO) {
    await fetch(
      `/api/admin/meetings/${meetingId}/live-agent/insights/${i.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned: !i.isPinned }),
      },
    );
    await refresh();
  }

  async function hide(i: LiveInsightDTO) {
    await fetch(
      `/api/admin/meetings/${meetingId}/live-agent/insights/${i.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isHidden: true }),
      },
    );
    await refresh();
  }

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      enabledRef.current = false;
      const rec = recognitionRef.current as
        | { stop?: () => void }
        | null;
      try {
        rec?.stop?.();
      } catch {
        /* ignore */
      }
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
    };
  }, []);

  const visibleInsights = insights.filter((i) => {
    if (i.isHidden) return false;
    if (filterCategory && i.category !== filterCategory) return false;
    if (filterPriority && i.priority !== filterPriority) return false;
    return true;
  });

  const allCategories = Array.from(new Set(insights.map((i) => i.category)));
  const allPriorities = Array.from(new Set(insights.map((i) => i.priority)));

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: T.panel,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{
              background: enabled ? T.accentPrimarySoft : T.panelElevated,
              color: enabled ? T.accentPrimary : T.textMuted,
            }}
          >
            <Bot size={18} />
          </span>
          <div className="flex flex-col">
            <span
              className="text-sm font-bold"
              style={{ color: T.textPrimary }}
            >
              Live AI Agent
            </span>
            <span
              className="text-[11px] flex items-center gap-1"
              style={{
                color:
                  statusMessage.startsWith("Помилка")
                    ? T.danger
                    : enabled
                      ? T.accentPrimary
                      : T.textMuted,
              }}
            >
              {busy && <Loader2 size={10} className="animate-spin" />}
              {statusMessage}
            </span>
          </div>
        </div>

        <button
          onClick={() => (enabled ? void stop() : void start())}
          disabled={mode === "browser" && !supported}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50"
          style={{
            background: enabled ? T.dangerSoft : T.accentPrimary,
            color: enabled ? T.danger : "#fff",
          }}
          title={
            enabled
              ? "Зупинити агента"
              : mode === "browser" && !supported
                ? "Браузер не підтримує розпізнавання мовлення"
                : "Запустити агента"
          }
        >
          {enabled ? <Pause size={14} /> : <Play size={14} />}
          {enabled ? "Зупинити" : "Увімкнути"}
        </button>
      </div>

      {/* Toggle режиму транскрипції */}
      <div className="mt-3 flex items-center gap-1 rounded-lg p-1" style={{ background: T.panelElevated }}>
        <button
          onClick={() => !enabled && setMode("browser")}
          disabled={enabled}
          className="flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition disabled:opacity-60"
          style={{
            background: mode === "browser" ? T.panel : "transparent",
            color: mode === "browser" ? T.textPrimary : T.textMuted,
            boxShadow: mode === "browser" ? `0 1px 2px ${T.borderSoft}` : undefined,
          }}
          title="Браузерна SpeechRecognition — безкоштовно, on-device. Якість залежить від браузера."
        >
          Браузер · безкоштовно
        </button>
        <button
          onClick={() => !enabled && setMode("assemblyai")}
          disabled={enabled}
          className="flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition disabled:opacity-60"
          style={{
            background: mode === "assemblyai" ? T.panel : "transparent",
            color: mode === "assemblyai" ? T.accentPrimary : T.textMuted,
            boxShadow: mode === "assemblyai" ? `0 1px 2px ${T.borderSoft}` : undefined,
          }}
          title="AssemblyAI Streaming — краща якість на UA/RU, ~$0.47/год."
        >
          <Zap size={11} /> AssemblyAI · ~$0.47/год
        </button>
      </div>

      {mode === "browser" && !supported && (
        <div
          className="mt-3 flex items-start gap-2 rounded-lg p-2.5 text-[11px]"
          style={{ background: T.amberSoft, color: T.amber }}
        >
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>
            Браузер не підтримує SpeechRecognition. Перемкни на AssemblyAI
            (працює всюди) або відкрий у Chrome / Edge / Safari.
          </span>
        </div>
      )}

      {error && (
        <div
          className="mt-3 flex items-start gap-2 rounded-lg p-2.5 text-[11px]"
          style={{ background: T.dangerSoft, color: T.danger }}
        >
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div
        className="mt-3 flex items-start gap-2 rounded-lg p-2.5 text-[10.5px] leading-relaxed"
        style={{ background: T.panelElevated, color: T.textMuted }}
      >
        <Sparkles size={12} className="mt-0.5 flex-shrink-0" />
        <span>
          AI-підказка не є юридичною консультацією. Перевіряйте з
          відповідальним спеціалістом.
        </span>
      </div>

      {cost && cost.calls > 0 && (
        <div
          className="mt-2 flex items-center gap-2 text-[10.5px]"
          style={{ color: T.textMuted }}
        >
          <CircleDollarSign size={11} />
          {cost.calls} запитів · ~$
          {Number(cost.estimatedCostUsd ?? 0).toFixed(4)}
        </div>
      )}

      {(allCategories.length > 0 || allPriorities.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-2">
          <FilterIcon size={12} style={{ color: T.textMuted }} />
          {allCategories.map((c) => (
            <button
              key={c}
              onClick={() =>
                setFilterCategory(filterCategory === c ? null : c)
              }
              className="rounded-md px-2 py-0.5 text-[10px] font-semibold"
              style={{
                background:
                  filterCategory === c ? categoryStyle(c).fg : T.panelElevated,
                color:
                  filterCategory === c
                    ? "#fff"
                    : categoryStyle(c).fg,
                border: `1px solid ${categoryStyle(c).fg}33`,
              }}
            >
              {CATEGORY_LABELS[c] ?? c}
            </button>
          ))}
          {allPriorities.map((p) => (
            <button
              key={p}
              onClick={() =>
                setFilterPriority(filterPriority === p ? null : p)
              }
              className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              style={{
                background:
                  filterPriority === p
                    ? priorityStyle(p).bg
                    : T.panelElevated,
                color: priorityStyle(p).fg,
                border: `1px solid ${priorityStyle(p).fg}33`,
              }}
            >
              {PRIORITY_LABELS[p] ?? p}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {visibleInsights.length === 0 && (
          <p className="text-[12px]" style={{ color: T.textMuted }}>
            {enabled
              ? "Чекаю на достатньо контексту для аналізу…"
              : "Підказки зʼявляться тут після увімкнення агента."}
          </p>
        )}
        {visibleInsights.map((i) => (
          <InsightCard
            key={i.id}
            insight={i}
            onPin={() => void togglePin(i)}
            onHide={() => void hide(i)}
          />
        ))}
      </div>
    </div>
  );
}

function InsightCard({
  insight: i,
  onPin,
  onHide,
}: {
  insight: LiveInsightDTO;
  onPin: () => void;
  onHide: () => void;
}) {
  const cat = categoryStyle(i.category);
  const pri = priorityStyle(i.priority);
  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: T.panel,
        border: `1px solid ${i.isPinned ? cat.fg : T.borderSoft}`,
        boxShadow: i.isPinned ? `0 0 0 1px ${cat.fg}33` : undefined,
      }}
    >
      <div className="flex items-start gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
              style={{ background: cat.bg, color: cat.fg }}
            >
              {CATEGORY_LABELS[i.category] ?? i.category}
            </span>
            <span
              className="rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              style={{ background: pri.bg, color: pri.fg }}
            >
              {PRIORITY_LABELS[i.priority] ?? i.priority}
            </span>
            {typeof i.confidence === "number" && (
              <span
                className="text-[10px]"
                style={{ color: T.textMuted }}
              >
                {Math.round(i.confidence * 100)}%
              </span>
            )}
          </div>
          <p
            className="text-[13px] font-bold leading-snug"
            style={{ color: T.textPrimary }}
          >
            {i.title}
          </p>
          {i.summary && (
            <p
              className="text-[12px] leading-relaxed"
              style={{ color: T.textSecondary }}
            >
              {i.summary}
            </p>
          )}
          {i.suggestedQuestion && (
            <div
              className="mt-1 rounded-md p-2"
              style={{
                background: T.accentPrimarySoft,
                color: T.accentPrimary,
              }}
            >
              <span
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: T.accentPrimary }}
              >
                Запитай зараз
              </span>
              <p className="mt-0.5 text-[12px] leading-relaxed">
                {i.suggestedQuestion}
              </p>
            </div>
          )}
          {i.actionItem && (
            <div
              className="mt-1 rounded-md p-2"
              style={{
                background: T.successSoft,
                color: T.success,
              }}
            >
              <span
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: T.success }}
              >
                Зафіксуй
              </span>
              <p className="mt-0.5 text-[12px] leading-relaxed">
                {i.actionItem}
              </p>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <button
            onClick={onPin}
            className="rounded-md p-1 transition hover:bg-[var(--t-panel-el)]"
            style={{ color: i.isPinned ? cat.fg : T.textMuted }}
            title={i.isPinned ? "Відкріпити" : "Закріпити"}
          >
            {i.isPinned ? <Pin size={14} /> : <PinOff size={14} />}
          </button>
          <button
            onClick={onHide}
            className="rounded-md p-1 transition hover:bg-[var(--t-panel-el)]"
            style={{ color: T.textMuted }}
            title="Приховати"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Browser SpeechRecognition mini-types (без офіційного DOM-типу зі старого
// stage-2 W3C draft, тож описуємо вручну те що нам треба).
// ────────────────────────────────────────────────────────────────────────
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult:
    | ((event: SpeechRecognitionEventLike) => void)
    | null;
  onerror:
    | ((event: SpeechRecognitionErrorLike) => void)
    | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0?: { transcript: string };
}

interface SpeechRecognitionErrorLike {
  error: string;
}
