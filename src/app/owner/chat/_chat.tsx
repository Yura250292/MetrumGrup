"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useRouter, useSearchParams } from "next/navigation";
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
  Plus,
  History,
  Trash2,
  Brain,
  X,
  Paperclip,
  FileText,
} from "lucide-react";
import { ChartBlock, parseChartConfig, type ChartKind } from "./_chart-block";
import { exportMessageToPdf, exportMessageToText } from "./_export";
import { fixMarkdownTables } from "./_md-fix";

interface Attachment {
  type: "image" | "document";
  mediaType: string;
  base64: string;
  name: string;
  /** Object URL for preview before send. */
  previewUrl?: string;
}

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

interface ConversationListItem {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: string;
}

interface InitialConversation {
  id: string;
  title: string;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    toolCallsJson: unknown;
  }>;
}

const SAMPLE_QUESTIONS = [
  "Які проекти у нас з найбільшими перевитратами?",
  "Скільки потратили на цемент за останній місяць?",
  "Покажи зарплати за квартал",
  "Які кошториси перевищують 1 млн?",
];

let counter = 0;
const newId = () => {
  counter += 1;
  return `m-${Date.now()}-${counter}`;
};

interface Props {
  conversations: ConversationListItem[];
  initialConversation: InitialConversation | null;
}

export function OwnerChat({ conversations: initialConversations, initialConversation }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [conversations, setConversations] = useState<ConversationListItem[]>(initialConversations);
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversation?.id ?? null,
  );

  const initialMessages: Message[] = initialConversation
    ? initialConversation.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolCalls: Array.isArray(m.toolCallsJson) ? (m.toolCallsJson as ToolCall[]) : undefined,
      }))
    : [];

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pending, setPending] = useState(false);
  const [thinkingMode, setThinkingMode] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function ensureConversation(): Promise<string | null> {
    if (conversationId) return conversationId;
    try {
      const res = await fetch("/api/owner/conversations", { method: "POST" });
      if (!res.ok) return null;
      const { conversation } = (await res.json()) as { conversation: { id: string; title: string } };
      setConversationId(conversation.id);
      setConversations((prev) => [
        {
          id: conversation.id,
          title: conversation.title,
          messageCount: 0,
          updatedAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      // Update URL без перезавантаження
      router.replace(`/owner/chat?c=${conversation.id}`, { scroll: false });
      return conversation.id;
    } catch {
      return null;
    }
  }

  async function send(text: string) {
    if ((!text.trim() && attachments.length === 0) || pending) return;

    const convId = await ensureConversation();

    const sentAttachments = attachments;
    const userText = text.trim() || (sentAttachments.length > 0 ? "(прикріплено файл)" : "");

    const userMsg: Message = { id: newId(), role: "user", content: userText };
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
    setAttachments([]);
    setPending(true);

    // Створюємо payload: усі попередні повідомлення без attachments,
    // останнє user — з ними.
    const historyPayload = messages.map((m) => ({ role: m.role, content: m.content }));
    historyPayload.push({
      role: "user",
      content: userText,
      ...(sentAttachments.length > 0
        ? {
            attachments: sentAttachments.map((a) => ({
              type: a.type,
              mediaType: a.mediaType,
              base64: a.base64,
              name: a.name,
            })),
          }
        : {}),
    } as { role: "user"; content: string });

    try {
      const res = await fetch("/api/owner/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: convId,
          thinking: thinkingMode,
          messages: historyPayload,
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

  const newChat = () => {
    setMessages([]);
    setConversationId(null);
    router.replace("/owner/chat", { scroll: false });
  };

  const switchConversation = (id: string) => {
    if (id !== conversationId) {
      router.push(`/owner/chat?c=${id}`);
    }
    setShowSidebar(false);
  };

  const deleteConversation = async (id: string) => {
    if (!confirm("Видалити цю розмову? Дані не можна буде відновити.")) return;
    try {
      const res = await fetch(`/api/owner/conversations/${id}`, { method: "DELETE" });
      if (!res.ok) return;
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (id === conversationId) newChat();
    } catch {
      // ignore
    }
  };

  const activeConvLabel = conversationId
    ? conversations.find((c) => c.id === conversationId)?.title ?? "Розмова"
    : "Нова розмова";

  // Sync URL ?c=ID changes (browser back/forward)
  useEffect(() => {
    const c = searchParams.get("c");
    if (c !== conversationId) {
      // do nothing — server-side rendered initial state, just track state
    }
  }, [searchParams, conversationId]);

  return (
    <div className="flex flex-col gap-3 h-[calc(100dvh-130px)]">
      {/* Top toolbar */}
      <div className="flex items-center justify-between gap-2 px-1">
        <button
          type="button"
          onClick={() => setShowSidebar(!showSidebar)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 hover:border-white/25 text-sm text-zinc-200 cursor-pointer transition"
        >
          <History size={14} />
          <span className="max-w-[180px] truncate">{activeConvLabel}</span>
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setThinkingMode(!thinkingMode)}
            title="Глибокий аналіз — для прогнозів та складних запитів"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm transition cursor-pointer ${
              thinkingMode
                ? "bg-violet-500/20 border border-violet-500/40 text-violet-200"
                : "bg-white/[0.04] border border-white/10 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Brain size={14} />
            <span className="hidden sm:inline">Думати</span>
          </button>
          <button
            type="button"
            onClick={newChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 hover:border-white/25 text-sm text-zinc-200 cursor-pointer transition"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">Нова</span>
          </button>
        </div>
      </div>

      {/* Conversations sidebar (drawer) */}
      <AnimatePresence>
        {showSidebar && (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/50"
              aria-label="Закрити"
              onClick={() => setShowSidebar(false)}
            />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", damping: 24, stiffness: 240 }}
              className="fixed left-0 top-0 bottom-0 w-[280px] z-50 bg-zinc-950 border-r border-white/10 backdrop-blur-xl shadow-2xl flex flex-col"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <h3 className="text-sm font-semibold text-white">Історія розмов</h3>
                <button
                  type="button"
                  onClick={() => setShowSidebar(false)}
                  className="text-zinc-400 hover:text-white p-1 cursor-pointer"
                  aria-label="Закрити"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
                {conversations.length === 0 ? (
                  <div className="text-xs text-zinc-500 text-center py-8 px-3">
                    Розмов поки немає. Задай перше питання — і вона з{"’"}явиться тут.
                  </div>
                ) : (
                  conversations.map((c) => (
                    <div
                      key={c.id}
                      className={`group flex items-center gap-1 rounded-xl px-2 py-2 transition cursor-pointer ${
                        c.id === conversationId
                          ? "bg-violet-500/15 border border-violet-500/30"
                          : "hover:bg-white/[0.04] border border-transparent"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => switchConversation(c.id)}
                        className="flex-1 text-left min-w-0 cursor-pointer"
                      >
                        <div className="text-sm text-white truncate">{c.title}</div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">
                          {c.messageCount} {c.messageCount === 1 ? "повід." : "повід."} ·{" "}
                          {new Date(c.updatedAt).toLocaleDateString("uk-UA")}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteConversation(c.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400 p-1.5 transition cursor-pointer"
                        aria-label="Видалити"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto pr-1 -mr-1 scroll-smooth"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}
      >
        {messages.length === 0 && <EmptyState onPick={(q) => send(q)} />}

        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <MessageRow key={m.id} message={m} />
          ))}
        </AnimatePresence>
      </div>

      <ChatInput
        input={input}
        setInput={setInput}
        attachments={attachments}
        setAttachments={setAttachments}
        pending={pending}
        onSend={() => send(input)}
        thinkingMode={thinkingMode}
      />
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
        Я знаю фінанси, проекти, кошториси, зарплати, контрагентів. Шукаю в інтернеті актуальні
        дані. Усі розмови зберігаються.
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
                remarkPlugins={[remarkGfm]}
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
                {fixMarkdownTables(message.content)}
              </ReactMarkdown>
            )}
          </div>
        )}

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

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024; // 5MB

function ChatInput({
  input,
  setInput,
  attachments,
  setAttachments,
  pending,
  onSend,
  thinkingMode,
}: {
  input: string;
  setInput: (s: string) => void;
  attachments: Attachment[];
  setAttachments: (a: Attachment[]) => void;
  pending: boolean;
  onSend: () => void;
  thinkingMode: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    setAttachError(null);
    const newOnes: Attachment[] = [];
    for (const file of Array.from(files)) {
      if (attachments.length + newOnes.length >= 5) {
        setAttachError("Максимум 5 файлів");
        break;
      }
      if (file.size > MAX_ATTACHMENT_SIZE) {
        setAttachError(`${file.name} > 5 МБ — занадто великий`);
        continue;
      }
      const isImage = file.type.startsWith("image/");
      const isPdf = file.type === "application/pdf";
      if (!isImage && !isPdf) {
        setAttachError(`${file.name}: підтримуються тільки зображення і PDF`);
        continue;
      }
      try {
        const base64 = await fileToBase64(file);
        newOnes.push({
          type: isImage ? "image" : "document",
          mediaType: file.type,
          base64,
          name: file.name,
          previewUrl: isImage ? URL.createObjectURL(file) : undefined,
        });
      } catch {
        setAttachError(`${file.name}: помилка читання`);
      }
    }
    if (newOnes.length > 0) {
      setAttachments([...attachments, ...newOnes]);
    }
  };

  const removeAttachment = (idx: number) => {
    const att = attachments[idx];
    if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
    setAttachments(attachments.filter((_, i) => i !== idx));
  };

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
    r.onerror = () => setRecording(false);
    r.onend = () => {
      setRecording(false);
      baseInput = (baseInput + " " + finalText).trim();
    };

    recognitionRef.current = r;
    r.start();
    setRecording(true);
  };

  return (
    <div className="shrink-0 z-20">
      <div
        className={`rounded-2xl bg-zinc-900/85 backdrop-blur-xl border p-2 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.6)] transition ${thinkingMode ? "border-violet-500/40" : "border-white/10"}`}
      >
        {thinkingMode && (
          <div className="px-2 pt-1 pb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-violet-300">
            <Brain size={10} />
            Глибокий аналіз увімкнено · відповідь буде довшою
          </div>
        )}

        {/* Attachments preview */}
        {attachments.length > 0 && (
          <div className="px-2 pt-1 pb-2 flex flex-wrap gap-2">
            {attachments.map((a, i) => (
              <div
                key={i}
                className="relative group rounded-lg overflow-hidden bg-white/[0.04] border border-white/10"
              >
                {a.type === "image" && a.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.previewUrl}
                    alt={a.name}
                    className="w-16 h-16 object-cover"
                  />
                ) : (
                  <div className="w-16 h-16 flex flex-col items-center justify-center text-zinc-400">
                    <FileText size={20} />
                    <span className="text-[8px] mt-0.5">PDF</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer"
                  aria-label="Видалити"
                >
                  <X size={10} />
                </button>
                <div className="px-1.5 pb-0.5 text-[9px] text-zinc-500 truncate max-w-[64px]">
                  {a.name}
                </div>
              </div>
            ))}
          </div>
        )}

        {attachError && (
          <div className="px-2 pb-1 text-[11px] text-rose-300">{attachError}</div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="sr-only"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.currentTarget.value = "";
          }}
        />

        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={pending || attachments.length >= 5}
            className="shrink-0 w-10 h-10 rounded-xl bg-white/[0.06] text-zinc-300 hover:bg-white/[0.10] flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
            aria-label="Прикріпити файл"
            title="Зображення або PDF (до 5MB кожен, до 5 файлів)"
          >
            <Paperclip size={16} />
          </button>
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
