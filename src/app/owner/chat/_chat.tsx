"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Sparkles,
  Loader2,
  Wrench,
  AlertCircle,
  Mic,
  MicOff,
  FileDown,
  Copy,
  Check,
  Globe,
} from "lucide-react";
import { ChartBlock, parseChartConfig, type ChartKind } from "./_chart-block";
import { exportMessageToPdf, exportMessageToText } from "./_export";

interface ToolCall {
  name: string;
  result?: string;
  server?: boolean;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  loading?: boolean;
  error?: string;
}

const SAMPLE_QUESTIONS = [
  "Які проекти у нас з найбільшими перевитратами?",
  "Скільки потратили на цемент за останній місяць?",
  "Спрогнозуй чи вистачить бюджету на проекті Тіфані",
  "Який зараз курс долара НБУ?",
];

let counter = 0;
const newId = () => {
  counter += 1;
  return `m-${Date.now()}-${counter}`;
};

export function OwnerChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || pending) return;

    const userMsg: Message = { id: newId(), role: "user", content: text.trim() };
    const assistantId = newId();
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      toolCalls: [],
      loading: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setPending(true);

    try {
      const res = await fetch("/api/owner/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const updateAssistant = (patch: (m: Message) => Message) => {
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? patch(m) : m)));
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const ev of events) {
          const lines = ev.split("\n");
          let eventName = "";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventName = line.slice(7).trim();
            else if (line.startsWith("data: ")) dataStr += line.slice(6);
          }
          if (!dataStr) continue;
          let data: unknown;
          try {
            data = JSON.parse(dataStr);
          } catch {
            continue;
          }

          if (eventName === "text") {
            const delta = (data as { delta: string }).delta;
            updateAssistant((m) => ({ ...m, content: m.content + delta, loading: false }));
          } else if (eventName === "tool_call") {
            const { name, server } = data as { name: string; server?: boolean };
            updateAssistant((m) => ({
              ...m,
              toolCalls: [...(m.toolCalls ?? []), { name, server }],
            }));
          } else if (eventName === "tool_result") {
            const { name, result } = data as { name: string; result: string };
            updateAssistant((m) => {
              const tc = [...(m.toolCalls ?? [])];
              for (let i = tc.length - 1; i >= 0; i--) {
                if (tc[i].name === name && !tc[i].result) {
                  tc[i] = { ...tc[i], result };
                  break;
                }
              }
              return { ...m, toolCalls: tc };
            });
          } else if (eventName === "error") {
            const { message } = data as { message: string };
            updateAssistant((m) => ({ ...m, error: message, loading: false }));
          } else if (eventName === "done") {
            updateAssistant((m) => ({ ...m, loading: false }));
          }
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Помилка";
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, error: message, loading: false } : m)),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 min-h-[calc(100dvh-180px)]">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto">
        {messages.length === 0 && <EmptyState onPick={(q) => send(q)} />}

        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <MessageRow key={m.id} message={m} />
          ))}
        </AnimatePresence>
      </div>

      <ChatInput input={input} setInput={setInput} pending={pending} onSend={() => send(input)} />
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="text-center py-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-rose-500 shadow-[0_15px_40px_-12px_rgba(168,85,247,0.5)] mb-4"
      >
        <Sparkles size={28} className="text-white" />
      </motion.div>
      <h2 className="text-xl font-bold text-white mb-1">Запитай про бізнес</h2>
      <p className="text-sm text-zinc-400 max-w-sm mx-auto leading-relaxed">
        Я знаю всі ваші фінанси, проекти, контрагентів. Можу шукати в інтернеті актуальні ціни і
        курси валют.
      </p>

      <div className="grid grid-cols-1 gap-2 mt-6 max-w-md mx-auto">
        {SAMPLE_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="text-left px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 hover:border-violet-500/40 hover:bg-white/[0.06] transition cursor-pointer text-sm text-zinc-200"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageRow({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const messageRef = useRef<HTMLDivElement | null>(null);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex ${isUser ? "justify-end" : "justify-start"} group`}
    >
      <div
        ref={messageRef}
        className={`max-w-[88%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-[0_8px_30px_-10px_rgba(168,85,247,0.5)]"
            : "bg-white/[0.04] border border-white/10 text-zinc-100"
        }`}
      >
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2 space-y-1">
            {message.toolCalls.map((tc, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px] text-zinc-400">
                {tc.result ? (
                  tc.server ? (
                    <Globe size={11} className="text-sky-400" />
                  ) : (
                    <Wrench size={11} className="text-emerald-400" />
                  )
                ) : (
                  <Loader2 size={11} className="text-zinc-500 animate-spin" />
                )}
                <span className="font-mono">{tc.server ? "🌐 web_search" : tc.name}</span>
                {tc.result ? (
                  <span className={tc.server ? "text-sky-400" : "text-emerald-400"}>✓</span>
                ) : (
                  <span className="text-zinc-500">виконую…</span>
                )}
              </div>
            ))}
          </div>
        )}

        {message.loading && !message.content ? (
          <div className="flex items-center gap-2 text-zinc-400 text-sm">
            <Loader2 size={14} className="animate-spin" />
            <span>Думаю…</span>
          </div>
        ) : (
          <div className={isUser ? "text-sm leading-relaxed" : "prose prose-invert prose-sm"}>
            {isUser ? (
              <p className="whitespace-pre-wrap m-0">{message.content}</p>
            ) : (
              <ReactMarkdown
                components={{
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-2 -mx-1">
                      <table className="w-full text-xs border-collapse">{children}</table>
                    </div>
                  ),
                  thead: ({ children }) => <thead className="bg-white/[0.04]">{children}</thead>,
                  th: ({ children }) => (
                    <th className="text-left px-2 py-1.5 font-semibold text-zinc-300 border-b border-white/10">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="px-2 py-1.5 text-zinc-200 border-b border-white/5">{children}</td>
                  ),
                  h1: ({ children }) => <h1 className="text-base font-bold text-white mt-3 mb-1">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-sm font-bold text-white mt-3 mb-1">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-sm font-semibold text-zinc-200 mt-2 mb-1">{children}</h3>,
                  p: ({ children }) => <p className="text-sm leading-relaxed my-1.5 text-zinc-200">{children}</p>,
                  ul: ({ children }) => <ul className="text-sm space-y-0.5 my-1.5 list-disc list-inside marker:text-zinc-500">{children}</ul>,
                  ol: ({ children }) => <ol className="text-sm space-y-0.5 my-1.5 list-decimal list-inside">{children}</ol>,
                  li: ({ children }) => <li className="text-zinc-200">{children}</li>,
                  strong: ({ children }) => <strong className="text-white font-bold">{children}</strong>,
                  hr: () => <hr className="my-3 border-white/10" />,
                  // Custom code: chart-bar / chart-line / chart-pie рендеримо як графік
                  code: ({ className, children }) => {
                    const lang = (className ?? "").replace(/^language-/, "");
                    const text = String(children).trim();
                    if (lang === "chart-bar" || lang === "chart-line" || lang === "chart-pie") {
                      const config = parseChartConfig(text);
                      const kind = lang.split("-")[1] as ChartKind;
                      if (config) return <ChartBlock kind={kind} config={config} />;
                    }
                    if (className) {
                      return (
                        <pre className="my-2 p-2 rounded-lg bg-black/40 border border-white/5 overflow-x-auto text-[11px]">
                          <code className="text-zinc-200">{children}</code>
                        </pre>
                      );
                    }
                    return (
                      <code className="bg-white/[0.06] text-amber-300 px-1 py-0.5 rounded text-[11px]">
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            )}
          </div>
        )}

        {/* Action bar — тільки для assistant з готовою відповіддю */}
        {!isUser && !message.loading && message.content && !message.error && (
          <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center gap-2 opacity-50 group-hover:opacity-100 transition">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[11px] text-zinc-300 transition cursor-pointer"
              title="Копіювати markdown"
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? "Скопійовано" : "Копіювати"}
            </button>
            <button
              type="button"
              onClick={() => exportMessageToPdf(messageRef.current, `metrum-chat-${Date.now()}`)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[11px] text-zinc-300 transition cursor-pointer"
              title="Зберегти як PDF"
            >
              <FileDown size={11} /> PDF
            </button>
            <button
              type="button"
              onClick={() => exportMessageToText(message.content, `metrum-answer-${Date.now()}`)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[11px] text-zinc-300 transition cursor-pointer"
              title="Зберегти як текст"
            >
              <FileDown size={11} /> TXT
            </button>
          </div>
        )}

        {message.error && (
          <div className="mt-2 flex items-center gap-2 text-xs text-rose-300 bg-rose-500/10 rounded-lg px-2 py-1.5">
            <AlertCircle size={12} />
            {message.error}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ChatInput({
  input,
  setInput,
  pending,
  onSend,
}: {
  input: string;
  setInput: (s: string) => void;
  pending: boolean;
  onSend: () => void;
}) {
  const [recording, setRecording] = useState(false);
  // Speech API підтримка — оцінюємо через useState initializer щоб не
  // тригерити cascading render (eslint react-hooks/set-state-in-effect).
  const [voiceSupported] = useState(() => {
    if (typeof window === "undefined") return false;
    const W = window as unknown as {
      SpeechRecognition?: unknown;
      webkitSpeechRecognition?: unknown;
    };
    return !!(W.SpeechRecognition ?? W.webkitSpeechRecognition);
  });
  const recognitionRef = useRef<unknown>(null);

  const toggleRecord = () => {
    if (recording) {
      const r = recognitionRef.current as { stop?: () => void } | null;
      r?.stop?.();
      setRecording(false);
      return;
    }
    const W = window as unknown as {
      SpeechRecognition?: new () => unknown;
      webkitSpeechRecognition?: new () => unknown;
    };
    const Cons = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Cons) return;

    type RecogEvent = {
      results: ArrayLike<{
        0: { transcript: string };
        isFinal: boolean;
      }>;
    };
    type Recog = {
      lang: string;
      continuous: boolean;
      interimResults: boolean;
      start: () => void;
      stop: () => void;
      onresult: (e: RecogEvent) => void;
      onerror: () => void;
      onend: () => void;
    };

    const r = new (Cons as new () => Recog)();
    r.lang = "uk-UA";
    r.continuous = false;
    r.interimResults = true;

    let finalText = "";
    let baseInput = input;
    r.onresult = (e: RecogEvent) => {
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          finalText += transcript + " ";
        } else {
          interim += transcript;
        }
      }
      const combined = (baseInput + " " + finalText + interim).trim();
      setInput(combined);
    };
    r.onerror = () => {
      setRecording(false);
    };
    r.onend = () => {
      setRecording(false);
      // Зберегти final text у baseInput для наступної сесії
      baseInput = (baseInput + " " + finalText).trim();
    };

    recognitionRef.current = r;
    r.start();
    setRecording(true);
  };

  return (
    <div className="sticky bottom-3 z-20">
      <div className="rounded-2xl bg-zinc-900/85 backdrop-blur-xl border border-white/10 p-2 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.6)]">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !pending) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder={recording ? "🎙️ Слухаю…" : "Спитай про витрати, проекти, прогнози…"}
            rows={1}
            className="flex-1 bg-transparent resize-none px-3 py-2.5 text-sm text-white focus:outline-none max-h-[160px] placeholder-zinc-500"
            style={{ minHeight: 40 }}
          />
          {voiceSupported && (
            <button
              type="button"
              onClick={toggleRecord}
              disabled={pending}
              className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition cursor-pointer ${
                recording
                  ? "bg-rose-500 text-white animate-pulse shadow-[0_4px_12px_rgba(244,63,94,0.5)]"
                  : "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.10]"
              }`}
              aria-label={recording ? "Зупинити запис" : "Голосовий ввід"}
              title={recording ? "Зупинити запис" : "Голосовий ввід (Speech API)"}
            >
              {recording ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          )}
          <button
            type="button"
            onClick={onSend}
            disabled={!input.trim() || pending}
            className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer active:scale-90 transition shadow-[0_4px_12px_-2px_rgba(168,85,247,0.5)]"
            aria-label="Надіслати"
          >
            {pending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
