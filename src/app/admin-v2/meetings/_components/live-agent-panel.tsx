"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
  BookOpenText,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Copy,
  Check,
  Search,
  ExternalLink,
  Briefcase,
  UserSquare,
  CalendarRange,
  ClipboardList,
  MessageSquare,
  Brain,
  ListChecks,
  Send,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { useAssemblyRealtime } from "@/lib/meetings/use-assembly-realtime";

type TranscribeMode = "browser" | "assemblyai";
type ResponseTone = "formal" | "neutral" | "firm";
type LiveTermDTO = {
  id: string;
  term: string;
  definition: string;
  contextInMeeting: string | null;
  createdAt: string;
};

type LookupKind =
  | "project"
  | "counterparty"
  | "meeting"
  | "foreman_report"
  | "task"
  | "material";

type LookupMatch = {
  kind: LookupKind;
  id: string;
  title: string;
  snippet: string;
  url: string;
};

type KnownEntityCard = {
  /** Унікальний ключ (text+type) — щоб не запитувати двічі. */
  key: string;
  query: string;
  type: string;
  matches: LookupMatch[];
  /** «not_found» якщо нічого не знайшли. */
  status: "found" | "not_found";
};

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
  suggestedResponses: Array<{ tone: ResponseTone; text: string }> | null;
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

// Швидкий перший виклик (200 chars / 12 сек) — щоб юзер ОДРАЗУ побачив
// що агент щось аналізує. Подальші виклики — більш стабільний поріг.
const CHUNK_MIN_CHARS_FIRST = 200;
const CHUNK_MIN_CHARS = 500;
const CHUNK_FLUSH_INTERVAL_MS_FIRST = 12_000;
const CHUNK_FLUSH_INTERVAL_MS = 30_000;
const CONTEXT_WINDOW_CHARS = 4000;

export function LiveAgentPanel({ meetingId }: { meetingId: string }) {
  // Згорнутий за замовчуванням, щоб не займати екран. Розгортається коли
  // юзер тицяє по хедеру. Якщо агент уже активний — лишаємо розгорнутим.
  const [expanded, setExpanded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<TranscribeMode>("browser");
  const [supported, setSupported] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string>("Вимкнено");
  const [busy, setBusy] = useState(false);
  const [insights, setInsights] = useState<LiveInsightDTO[]>([]);
  const [terms, setTerms] = useState<LiveTermDTO[]>([]);
  const [cost, setCost] = useState<CostSummary | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterPriority, setFilterPriority] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Briefing state
  const [briefing, setBriefing] = useState<string | null>(null);
  const [briefingGeneratedAt, setBriefingGeneratedAt] = useState<string | null>(
    null,
  );
  const [briefingExpanded, setBriefingExpanded] = useState(false);
  const [briefingLoading, setBriefingLoading] = useState(false);

  // Live lookup state — "Я знаю про X" cards.
  const [knownCards, setKnownCards] = useState<KnownEntityCard[]>([]);
  const lookedUpKeysRef = useRef<Set<string>>(new Set());

  // RAG: фрагменти з проєктних файлів які знайшов /analyze.
  const [projectFileHits, setProjectFileHits] = useState<
    Array<{ fileName: string; content: string; similarity: number }>
  >([]);

  // Активна вкладка: Факти / Психолог / Чат
  type Tab = "facts" | "coach" | "chat";
  const [activeTab, setActiveTab] = useState<Tab>("facts");

  // Психолог: останні coachHints з /analyze.
  type CoachHintsDTO = {
    tone: string;
    manipulations: Array<{ type: string; evidence: string; counter: string }>;
    tips: string[];
  };
  const [coachHints, setCoachHints] = useState<CoachHintsDTO | null>(null);

  // Чат: історія повідомлень + ввід + стан надсилання.
  type ChatMsg = { role: "user" | "assistant"; content: string };
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Live-видимість: останнє що почуто + розмір буфера. Оновлюється з
  // інтервалом щоб UI не лагало (refs змінюються поза React).
  const [bufferDisplay, setBufferDisplay] = useState<string>("");
  const [analyzeCount, setAnalyzeCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => {
      const buf = bufferRef.current.trim();
      // Останні ~200 chars щоб показати юзеру що чується.
      setBufferDisplay(buf.length > 200 ? "…" + buf.slice(-200) : buf);
    }, 800);
    return () => clearInterval(t);
  }, [enabled]);

  // Після першого аналізу — переключаємо таймер на повільніший інтервал
  // (30с замість 12с) щоб не флудити токенами в steady-state.
  useEffect(() => {
    if (analyzeCount !== 1 || !enabled || !flushTimerRef.current) return;
    clearInterval(flushTimerRef.current);
    flushTimerRef.current = setInterval(() => {
      if (bufferRef.current.trim().length >= 200) void flush();
    }, CHUNK_FLUSH_INTERVAL_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyzeCount, enabled]);

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
      const threshold =
        analyzeCount === 0 ? CHUNK_MIN_CHARS_FIRST : CHUNK_MIN_CHARS;
      if (bufferRef.current.length >= threshold) void flush();
    },
    onError: (msg) => setError(`AssemblyAI Realtime: ${msg}`),
    onStateChange: (s) => {
      if (s === "connecting")
        setStatusMessage("Підключення до AssemblyAI…");
      else if (s === "active") setStatusMessage("Активний — AssemblyAI Realtime");
      else if (s === "error") setStatusMessage("Помилка AssemblyAI");
    },
  });

  // Refresh insights + terms + briefing on mount.
  useEffect(() => {
    void refresh();
    void loadBriefing();
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
      setTerms(data.glossaryTerms ?? []);
      setCost(data.cost ?? null);
    } catch {
      /* ignore */
    }
  }

  async function loadBriefing() {
    try {
      const res = await fetch(
        `/api/admin/meetings/${meetingId}/live-agent/briefing`,
      );
      if (!res.ok) return;
      const data = await res.json();
      setBriefing(data.briefing ?? null);
      setBriefingGeneratedAt(data.generatedAt ?? null);
    } catch {
      /* ignore */
    }
  }

  async function sendChat() {
    const message = chatInput.trim();
    if (!message || chatBusy) return;
    setChatBusy(true);
    setChatError(null);
    const nextHistory: ChatMsg[] = [
      ...chatMessages,
      { role: "user", content: message },
    ];
    setChatMessages(nextHistory);
    setChatInput("");
    try {
      const res = await fetch(
        `/api/admin/meetings/${meetingId}/live-agent/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            // не шлемо щойно додане user-повідомлення двічі — лише ПОПЕРЕДНЮ історію.
            history: chatMessages.slice(-20),
          }),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const reply = (data.reply ?? "").trim() || "(порожня відповідь)";
      setChatMessages([
        ...nextHistory,
        { role: "assistant", content: reply },
      ]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Помилка чату");
    } finally {
      setChatBusy(false);
    }
  }

  async function runLookup(text: string, type: string, key: string) {
    try {
      const res = await fetch(
        `/api/admin/meetings/${meetingId}/live-agent/lookup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        },
      );
      if (!res.ok) return;
      const data = await res.json();
      const matches: LookupMatch[] = data.matches ?? [];
      // Не показуємо «not_found» картки для типів які навмисно широкі
      // (other / person), щоб не флудити панель.
      if (matches.length === 0) {
        if (type === "other" || type === "person") return;
      }
      setKnownCards((prev) => {
        if (prev.find((c) => c.key === key)) return prev;
        return [
          ...prev,
          {
            key,
            query: text,
            type,
            matches,
            status: matches.length > 0 ? "found" : "not_found",
          },
        ];
      });
    } catch {
      /* ignore */
    }
  }

  async function generateOrRegenBriefing() {
    setBriefingLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/meetings/${meetingId}/live-agent/briefing`,
        { method: "POST" },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setBriefing(data.briefing ?? null);
      setBriefingGeneratedAt(data.generatedAt ?? null);
      setBriefingExpanded(true);
      // Cost оновлюємо щоб у статі-блоку видно було що додалось
      void refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? `Briefing: ${err.message}`
          : "Помилка briefing-у",
      );
    } finally {
      setBriefingLoading(false);
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

    // Flush-таймер: 12с до першого аналізу, 30с після (швидкий перший
    // відгук без флуду далі).
    flushTimerRef.current = setInterval(() => {
      if (bufferRef.current.trim().length >= 80) void flush();
    }, CHUNK_FLUSH_INTERVAL_MS_FIRST);

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
          const threshold =
            analyzeCount === 0 ? CHUNK_MIN_CHARS_FIRST : CHUNK_MIN_CHARS;
          if (bufferRef.current.length >= threshold) {
            void flush();
          }
        }
      }
    };
    rec.onerror = (ev: SpeechRecognitionErrorLike) => {
      console.warn("[LiveAgent] SpeechRecognition error:", ev.error);
      // «aborted» — це нормальна реакція на наш .stop() / зміну mode.
      // Не показуємо як помилку, не перезапускаємо.
      if (ev.error === "aborted") return;
      // Транзиентні помилки — мовчки переспроба через onend.
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
      const responseBody = await res.json().catch(() => ({}));
      // Зрушуємо контекст: тримаємо вікно з останнього chunk + попередніх.
      recentContextRef.current = (
        recentContext +
        "\n" +
        chunk
      ).slice(-CONTEXT_WINDOW_CHARS);

      // Запускаємо lookup-и для нових ентіті — в фоні, не блокуючи refresh.
      const ents: Array<{ type: string; text: string }> =
        responseBody?.entitiesToLookup ?? [];
      for (const ent of ents) {
        const text = (ent.text ?? "").trim();
        if (!text || text.length < 3) continue;
        const key = `${ent.type}:${text.toLowerCase()}`;
        if (lookedUpKeysRef.current.has(key)) continue;
        lookedUpKeysRef.current.add(key);
        void runLookup(text, ent.type, key);
      }

      // CoachHints — оновлюємо вкладку «Психолог».
      if (responseBody?.coachHints) {
        setCoachHints(responseBody.coachHints as CoachHintsDTO);
      }

      // RAG — фрагменти з проєктних файлів. Зберігаємо у стейт щоб показати
      // юзеру (з якого файлу що знайшли).
      const projFiles: Array<{
        fileName: string;
        content: string;
        similarity: number;
      }> = responseBody?.projectFiles ?? [];
      if (projFiles.length > 0) {
        setProjectFileHits((prev) => {
          // Дедуп по (fileName + first 100 chars контенту) — не повторюємо одне.
          const seen = new Set(
            prev.map(
              (h) =>
                `${h.fileName}:${h.content.slice(0, 100).toLowerCase()}`,
            ),
          );
          const next = [...prev];
          for (const f of projFiles) {
            const key = `${f.fileName}:${f.content.slice(0, 100).toLowerCase()}`;
            if (seen.has(key)) continue;
            seen.add(key);
            next.push(f);
          }
          // Тримаємо не більше 12 останніх щоб не флудити панель.
          return next.slice(-12);
        });
      }

      await refresh();
      setAnalyzeCount((n) => n + 1);
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

  // Авто-розгортаємо коли агент активний — щоб юзер бачив live-буфер і факти.
  useEffect(() => {
    if (enabled) setExpanded(true);
  }, [enabled]);

  const insightCount = insights.filter((i) => !i.isHidden).length;

  return (
    <div
      className="rounded-2xl"
      style={{
        background: T.panel,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      {/* HEADER — завжди видимий. Клік по лівій частині — розгорнути/згорнути. */}
      <div className="flex items-center gap-2 p-3 sm:p-4">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
          title={expanded ? "Згорнути" : "Розгорнути Live AI Agent"}
        >
          <span
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
            style={{
              background: enabled ? T.accentPrimarySoft : T.panelElevated,
              color: enabled ? T.accentPrimary : T.textMuted,
            }}
          >
            <Bot size={18} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span
              className="flex items-center gap-1.5 text-sm font-bold"
              style={{ color: T.textPrimary }}
            >
              Live AI Agent
              {enabled && (
                <span
                  className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full"
                  style={{ background: T.accentPrimary }}
                  aria-hidden
                />
              )}
              {!expanded && insightCount > 0 && (
                <span
                  className="rounded-full px-1.5 py-0 text-[10px] font-bold"
                  style={{ background: T.accentPrimarySoft, color: T.accentPrimary }}
                >
                  {insightCount}
                </span>
              )}
            </span>
            <span
              className="truncate text-[11px] flex items-center gap-1"
              style={{
                color:
                  statusMessage.startsWith("Помилка")
                    ? T.danger
                    : enabled
                      ? T.accentPrimary
                      : T.textMuted,
              }}
            >
              {busy && <Loader2 size={10} className="animate-spin flex-shrink-0" />}
              <span className="truncate">{statusMessage}</span>
            </span>
          </div>
          <span
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md"
            style={{ color: T.textMuted }}
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!enabled && !expanded) setExpanded(true);
            return enabled ? void stop() : void start();
          }}
          disabled={mode === "browser" && !supported}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12.5px] font-semibold disabled:opacity-50"
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
          {enabled ? <Pause size={13} /> : <Play size={13} />}
          <span className="hidden sm:inline">{enabled ? "Зупинити" : "Увімкнути"}</span>
        </button>
      </div>

      {/* BODY — рендериться лише коли expanded */}
      {expanded && (
      <div className="px-3 sm:px-4 pb-3 sm:pb-4">

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

      {/* Pre-meeting briefing */}
      <div
        className="mt-3 rounded-lg p-3"
        style={{ background: T.panelElevated, border: `1px solid ${T.borderSoft}` }}
      >
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => briefing && setBriefingExpanded((v) => !v)}
            disabled={!briefing}
            className="flex flex-1 items-center gap-2 text-left disabled:cursor-default"
          >
            <BookOpenText
              size={14}
              style={{ color: briefing ? T.indigo : T.textMuted }}
            />
            <span
              className="text-[12px] font-bold"
              style={{ color: T.textPrimary }}
            >
              Довідка перед нарадою
            </span>
            {briefingGeneratedAt && (
              <span className="text-[10px]" style={{ color: T.textMuted }}>
                {new Date(briefingGeneratedAt).toLocaleString("uk-UA")}
              </span>
            )}
            {briefing && (
              <span className="ml-auto" style={{ color: T.textMuted }}>
                {briefingExpanded ? (
                  <ChevronUp size={14} />
                ) : (
                  <ChevronDown size={14} />
                )}
              </span>
            )}
          </button>
          <button
            onClick={() => void generateOrRegenBriefing()}
            disabled={briefingLoading}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold disabled:opacity-50"
            style={{
              background: briefing ? T.panel : T.indigo,
              color: briefing ? T.indigo : "#fff",
              border: briefing ? `1px solid ${T.indigo}33` : "none",
            }}
            title={
              briefing
                ? "Перегенерувати довідку (нова версія перепише поточну)"
                : "Згенерувати pre-meeting довідку — ключові факти про проєкт, на що звернути увагу, корисні питання, словник можливих термінів"
            }
          >
            {briefingLoading ? (
              <Loader2 size={11} className="animate-spin" />
            ) : briefing ? (
              <RefreshCw size={11} />
            ) : (
              <Sparkles size={11} />
            )}
            {briefing ? "Оновити" : "Згенерувати"}
          </button>
        </div>
        {briefing && briefingExpanded && (
          <div
            className="mt-2 text-[12px] leading-relaxed"
            style={{ color: T.textPrimary }}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h2: (props) => (
                  <h2
                    {...props}
                    className="mt-3 mb-1 text-[12px] font-bold"
                    style={{ color: T.indigo }}
                  />
                ),
                h3: (props) => (
                  <h3
                    {...props}
                    className="mt-2 mb-1 text-[11px] font-bold"
                    style={{ color: T.textPrimary }}
                  />
                ),
                ul: (props) => (
                  <ul {...props} className="my-1 list-disc pl-5 space-y-0.5" />
                ),
                ol: (props) => (
                  <ol
                    {...props}
                    className="my-1 list-decimal pl-5 space-y-0.5"
                  />
                ),
                p: (props) => <p {...props} className="my-1" />,
                strong: (props) => (
                  <strong
                    {...props}
                    style={{ color: T.textPrimary, fontWeight: 700 }}
                  />
                ),
              }}
            >
              {briefing}
            </ReactMarkdown>
          </div>
        )}
        {!briefing && !briefingLoading && (
          <p className="mt-1 text-[10.5px]" style={{ color: T.textMuted }}>
            AI прочитає метадані наради + останні наради по проєкту і складе
            1-сторінкову шпаргалку до старту.
          </p>
        )}
      </div>

      {/* Live glossary strip */}
      {terms.length > 0 && (
        <div className="mt-3">
          <div
            className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
            style={{ color: T.textMuted }}
          >
            <BookOpenText size={11} /> Терміни в розмові
          </div>
          <div className="flex flex-wrap gap-1.5">
            {terms.slice(0, 30).map((t) => (
              <span
                key={t.id}
                className="rounded-md px-2 py-0.5 text-[10.5px] font-medium cursor-help"
                style={{
                  background: T.skySoft,
                  color: T.sky,
                  border: `1px solid ${T.sky}33`,
                }}
                title={`${t.term} — ${t.definition}${t.contextInMeeting ? "\n\nУ цій нараді: " + t.contextInMeeting : ""}`}
              >
                {t.term}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* «Я знаю про…» — live RAG картки */}
      {activeTab === "facts" && knownCards.length > 0 && (
        <div className="mt-3">
          <div
            className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
            style={{ color: T.textMuted }}
          >
            <Search size={11} /> Я знаю про…
          </div>
          <div className="flex flex-col gap-2">
            {knownCards.slice(-8).map((c) => (
              <KnownCardView key={c.key} card={c} />
            ))}
          </div>
        </div>
      )}

      {/* RAG: фрагменти з проєктних файлів (геодезія, специфікації) */}
      {activeTab === "facts" && projectFileHits.length > 0 && (
        <div className="mt-3">
          <div
            className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
            style={{ color: T.textMuted }}
          >
            📂 З файлів проєкту
          </div>
          <div className="flex flex-col gap-2">
            {projectFileHits.slice(-8).map((h, i) => (
              <div
                key={`${h.fileName}-${i}`}
                className="rounded-lg p-2.5"
                style={{
                  background: T.panel,
                  border: `1px solid ${T.borderSoft}`,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-[11px] font-bold"
                    style={{ color: T.accentPrimary }}
                  >
                    {h.fileName}
                  </span>
                  <span
                    className="text-[10px]"
                    style={{ color: T.textMuted }}
                  >
                    {Math.round(h.similarity * 100)}% збіг
                  </span>
                </div>
                <p
                  className="mt-1 text-[11px] leading-relaxed"
                  style={{ color: T.textSecondary }}
                >
                  {h.content.slice(0, 400)}
                  {h.content.length > 400 ? "…" : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* LIVE BUFFER — показує що мікрофон чує + кнопка форсувати аналіз */}
      {enabled && (
        <div
          className="mt-3 rounded-lg p-2.5"
          style={{
            background: T.panelElevated,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
              style={{ color: T.textMuted }}
            >
              🎤 Чую зараз ({bufferDisplay.length} / {analyzeCount === 0 ? CHUNK_MIN_CHARS_FIRST : CHUNK_MIN_CHARS} chars · {analyzeCount} аналізів)
            </span>
            <button
              onClick={() => void flush()}
              disabled={bufferDisplay.length < 30 || busy}
              className="rounded-md px-2 py-0.5 text-[10px] font-semibold disabled:opacity-40"
              style={{
                background: T.accentPrimarySoft,
                color: T.accentPrimary,
                border: `1px solid ${T.accentPrimary}33`,
              }}
              title="Не чекати буфер — проаналізувати зараз"
            >
              Аналізувати
            </button>
          </div>
          <p
            className="mt-1.5 text-[11px] italic leading-relaxed"
            style={{
              color: bufferDisplay ? T.textSecondary : T.textMuted,
              minHeight: "2.5em",
            }}
          >
            {bufferDisplay || "(тиша — переконайся що мікрофон вмикнено і чує звук)"}
          </p>
        </div>
      )}

      {/* TABS */}
      <div
        className="mt-3 flex items-center gap-1 rounded-lg p-1"
        style={{ background: T.panelElevated }}
      >
        <TabBtnSmall
          active={activeTab === "facts"}
          onClick={() => setActiveTab("facts")}
          icon={<ListChecks size={13} />}
          label="Факти"
        />
        <TabBtnSmall
          active={activeTab === "coach"}
          onClick={() => setActiveTab("coach")}
          icon={<Brain size={13} />}
          label="Психолог"
        />
        <TabBtnSmall
          active={activeTab === "chat"}
          onClick={() => setActiveTab("chat")}
          icon={<MessageSquare size={13} />}
          label="Чат"
        />
      </div>

      {/* COACH TAB */}
      {activeTab === "coach" && (
        <CoachTabView hints={coachHints} enabled={enabled} />
      )}

      {/* CHAT TAB */}
      {activeTab === "chat" && (
        <ChatTabView
          messages={chatMessages}
          input={chatInput}
          setInput={setChatInput}
          onSend={() => void sendChat()}
          busy={chatBusy}
          error={chatError}
        />
      )}

      {/* FACTS TAB — все існуюче рендериться лише на цій вкладці */}
      {activeTab === "facts" && (allCategories.length > 0 || allPriorities.length > 0) && (
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

      {activeTab === "facts" && (
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
      )}
      </div>
      )}
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
          {i.suggestedResponses && i.suggestedResponses.length > 0 && (
            <div
              className="mt-1 rounded-md p-2"
              style={{
                background: T.indigoSoft,
              }}
            >
              <span
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: T.indigo }}
              >
                Як відповісти
              </span>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {i.suggestedResponses.map((r, ri) => (
                  <SuggestedResponseRow key={ri} tone={r.tone} text={r.text} />
                ))}
              </div>
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

const TONE_LABEL: Record<ResponseTone, string> = {
  formal: "Офіційно",
  neutral: "Нейтрально",
  firm: "Наполегливо",
};

const KIND_META: Record<
  LookupKind,
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  project: {
    label: "Проєкт",
    color: T.indigo,
    bg: T.indigoSoft,
    icon: <Briefcase size={11} />,
  },
  counterparty: {
    label: "Контрагент",
    color: T.accentSecondary,
    bg: T.panelElevated,
    icon: <UserSquare size={11} />,
  },
  meeting: {
    label: "Нарада",
    color: T.accentPrimary,
    bg: T.accentPrimarySoft,
    icon: <CalendarRange size={11} />,
  },
  foreman_report: {
    label: "Звіт виконроба",
    color: T.warning,
    bg: T.amberSoft,
    icon: <ClipboardList size={11} />,
  },
  task: {
    label: "Задача",
    color: T.success,
    bg: T.successSoft,
    icon: <ClipboardList size={11} />,
  },
  material: {
    label: "Матеріал",
    color: T.textSecondary,
    bg: T.panelElevated,
    icon: <ClipboardList size={11} />,
  },
};

function KnownCardView({ card }: { card: KnownEntityCard }) {
  return (
    <div
      className="rounded-lg p-2.5"
      style={{
        background: T.panel,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      <div className="flex items-center gap-2">
        <Search size={12} style={{ color: T.textMuted }} />
        <span
          className="text-[12px] font-bold"
          style={{ color: T.textPrimary }}
        >
          {card.query}
        </span>
        <span
          className="rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
          style={{
            background: T.panelElevated,
            color: T.textMuted,
          }}
        >
          {card.type}
        </span>
      </div>
      {card.status === "not_found" ? (
        <p
          className="mt-1 text-[11px] italic"
          style={{ color: T.textMuted }}
        >
          У базі нічого не знайшов — перепитай у співрозмовника.
        </p>
      ) : (
        <div className="mt-1.5 flex flex-col gap-1">
          {card.matches.map((m) => {
            const meta = KIND_META[m.kind];
            return (
              <a
                key={m.kind + m.id}
                href={m.url}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-md p-2 transition hover:brightness-105"
                style={{
                  background: meta.bg,
                  textDecoration: "none",
                }}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                    style={{ background: T.panel, color: meta.color }}
                  >
                    {meta.icon} {meta.label}
                  </span>
                  <span
                    className="text-[12px] font-semibold flex-1 truncate"
                    style={{ color: T.textPrimary }}
                  >
                    {m.title}
                  </span>
                  <ExternalLink size={10} style={{ color: T.textMuted }} />
                </div>
                {m.snippet && (
                  <p
                    className="mt-1 text-[11px] leading-relaxed"
                    style={{ color: T.textSecondary }}
                  >
                    {m.snippet}
                  </p>
                )}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SuggestedResponseRow({
  tone,
  text,
}: {
  tone: ResponseTone;
  text: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className="rounded-md p-2"
      style={{
        background: T.panel,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <span
          className="text-[9px] font-bold uppercase tracking-wider"
          style={{ color: T.indigo }}
        >
          {TONE_LABEL[tone]}
        </span>
        <button
          onClick={() => void copy()}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px]"
          style={{
            background: copied ? T.successSoft : "transparent",
            color: copied ? T.success : T.textMuted,
          }}
          title="Скопіювати у буфер"
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
          {copied ? "Скопійовано" : "Копіювати"}
        </button>
      </div>
      <p
        className="text-[12px] leading-relaxed"
        style={{ color: T.textPrimary }}
      >
        {text}
      </p>
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

// ────────────────────────────────────────────────────────────────────────
// Tabs / Coach / Chat — компоненти для відповідних вкладок.
// ────────────────────────────────────────────────────────────────────────

function TabBtnSmall({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] font-semibold transition"
      style={{
        background: active ? T.panel : "transparent",
        color: active ? T.accentPrimary : T.textMuted,
        boxShadow: active ? `0 1px 2px ${T.borderSoft}` : undefined,
      }}
    >
      {icon} {label}
    </button>
  );
}

const TONE_LABELS: Record<string, string> = {
  neutral: "Нейтрально",
  constructive: "Конструктивно",
  tense: "Напружено",
  evasive: "Ухиляється",
  pressuring: "Тиск",
  friendly: "Дружньо",
  hostile: "Ворожо",
};

function toneStyle(tone: string): { bg: string; fg: string } {
  if (tone === "hostile" || tone === "pressuring")
    return { bg: T.dangerSoft, fg: T.danger };
  if (tone === "tense" || tone === "evasive")
    return { bg: T.amberSoft, fg: T.amber };
  if (tone === "constructive" || tone === "friendly")
    return { bg: T.successSoft, fg: T.success };
  return { bg: T.panelElevated, fg: T.textMuted };
}

function CoachTabView({
  hints,
  enabled,
}: {
  hints: {
    tone: string;
    manipulations: Array<{ type: string; evidence: string; counter: string }>;
    tips: string[];
  } | null;
  enabled: boolean;
}) {
  if (!hints) {
    return (
      <p className="mt-3 text-[12px]" style={{ color: T.textMuted }}>
        {enabled
          ? "Психолог-аналіз ще не готовий — слухаю розмову…"
          : "Увімкни агента — буде аналіз тону розмови і виявлення маніпуляцій."}
      </p>
    );
  }
  const ts = toneStyle(hints.tone);
  return (
    <div className="mt-3 flex flex-col gap-2">
      <div
        className="rounded-lg p-2.5"
        style={{ background: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <div
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: T.textMuted }}
        >
          Тон розмови
        </div>
        <span
          className="mt-1 inline-flex rounded-md px-2 py-0.5 text-[12px] font-bold"
          style={{ background: ts.bg, color: ts.fg }}
        >
          {TONE_LABELS[hints.tone] ?? hints.tone}
        </span>
      </div>

      {hints.manipulations.length > 0 && (
        <div className="flex flex-col gap-2">
          <div
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color: T.danger }}
          >
            ⚠️ Виявлено маніпуляції
          </div>
          {hints.manipulations.map((m, i) => (
            <div
              key={i}
              className="rounded-lg p-2.5"
              style={{
                background: T.dangerSoft,
                border: `1px solid ${T.danger}33`,
              }}
            >
              <p
                className="text-[12px] font-bold"
                style={{ color: T.danger }}
              >
                {m.type}
              </p>
              <p
                className="mt-1 text-[11px] italic"
                style={{ color: T.textSecondary }}
              >
                «{m.evidence}»
              </p>
              <div
                className="mt-2 text-[10px] font-bold uppercase tracking-wider"
                style={{ color: T.accentPrimary }}
              >
                Як відповісти
              </div>
              <p
                className="text-[12px] leading-relaxed"
                style={{ color: T.textPrimary }}
              >
                {m.counter}
              </p>
            </div>
          ))}
        </div>
      )}

      {hints.tips.length > 0 && (
        <div className="flex flex-col gap-1">
          <div
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color: T.textMuted }}
          >
            Тактичні поради
          </div>
          {hints.tips.map((t, i) => (
            <div
              key={i}
              className="rounded-lg p-2"
              style={{ background: T.panelElevated }}
            >
              <p
                className="text-[12px] leading-relaxed"
                style={{ color: T.textPrimary }}
              >
                {t}
              </p>
            </div>
          ))}
        </div>
      )}

      {hints.manipulations.length === 0 && hints.tips.length === 0 && (
        <p className="text-[12px]" style={{ color: T.textMuted }}>
          Поки що нічого підозрілого. Розмова йде нормально.
        </p>
      )}
    </div>
  );
}

function ChatTabView({
  messages,
  input,
  setInput,
  onSend,
  busy,
  error,
}: {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div className="mt-3 flex flex-col gap-2">
      <div
        className="flex flex-col gap-2 overflow-y-auto rounded-lg p-2"
        style={{
          background: T.panelElevated,
          maxHeight: 360,
          minHeight: 100,
        }}
      >
        {messages.length === 0 && !busy && (
          <p className="text-[12px]" style={{ color: T.textMuted }}>
            Запитай агента про що завгодно. Він бачить транскрипт розмови,
            знайдені інсайти і файли проєкту (якщо нарада привʼязана до
            проєкту і файли проіндексовані).
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className="rounded-lg p-2"
            style={{
              background:
                m.role === "user" ? T.accentPrimarySoft : T.panel,
              border:
                m.role === "user"
                  ? `1px solid ${T.accentPrimary}33`
                  : `1px solid ${T.borderSoft}`,
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "92%",
            }}
          >
            <div
              className="text-[9px] font-bold uppercase tracking-wider"
              style={{
                color:
                  m.role === "user" ? T.accentPrimary : T.textMuted,
              }}
            >
              {m.role === "user" ? "Ти" : "Агент"}
            </div>
            <p
              className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed"
              style={{ color: T.textPrimary }}
            >
              {m.content}
            </p>
          </div>
        ))}
        {busy && (
          <div
            className="flex items-center gap-2 text-[11px]"
            style={{ color: T.textMuted }}
          >
            <Loader2 size={12} className="animate-spin" /> Агент думає…
          </div>
        )}
      </div>
      {error && (
        <div
          className="rounded-md px-2 py-1.5 text-[11px]"
          style={{ background: T.dangerSoft, color: T.danger }}
        >
          {error}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="Запитай агента…  ⌘+Enter — надіслати"
          rows={2}
          className="flex-1 resize-none rounded-lg p-2 text-[12px] leading-relaxed outline-none"
          style={{
            background: T.panel,
            color: T.textPrimary,
            border: `1px solid ${T.borderSoft}`,
          }}
        />
        <button
          onClick={onSend}
          disabled={busy || !input.trim()}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg disabled:opacity-50"
          style={{ background: T.accentPrimary, color: "#fff" }}
          title="Надіслати (⌘+Enter)"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
