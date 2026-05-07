"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  FileText,
  Square,
  RefreshCcw,
  Search,
  Pencil,
  Pin,
  PinOff,
  Folder,
  FolderInput,
  Bookmark,
  BookmarkCheck,
  Volume2,
  VolumeX,
  Share2,
  FileDown as FileDownIcon,
} from "lucide-react";
import { ChartBlock, parseChartConfig, type ChartKind } from "./_chart-block";
import { exportMessageToPdf } from "./_export";
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
  /** ISO timestamp. Для нових клієнтських — Date.now(); для server-loaded — з БД. */
  createdAt?: string;
  isBookmarked?: boolean;
}

interface ConversationListItem {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: string;
  isPinned: boolean;
  folderId: string | null;
  shareToken: string | null;
}

interface FolderItem {
  id: string;
  name: string;
  color: string | null;
  conversationCount: number;
}

interface InitialConversation {
  id: string;
  title: string;
  shareToken: string | null;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    toolCallsJson: unknown;
    createdAt?: string;
    isBookmarked?: boolean;
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
  folders: FolderItem[];
  initialConversation: InitialConversation | null;
}

export function OwnerChat({
  conversations: initialConversations,
  folders: initialFolders,
  initialConversation,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [conversations, setConversations] = useState<ConversationListItem[]>(initialConversations);
  const [folders, setFolders] = useState<FolderItem[]>(initialFolders);
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversation?.id ?? null,
  );

  const initialMessages: Message[] = initialConversation
    ? initialConversation.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolCalls: Array.isArray(m.toolCallsJson) ? (m.toolCallsJson as ToolCall[]) : undefined,
        createdAt: m.createdAt,
      }))
    : [];

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pending, setPending] = useState(false);
  const [thinkingMode, setThinkingMode] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [savedHint, setSavedHint] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const abortRef = useRef<AbortController | null>(null);

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
          isPinned: false,
          folderId: null,
          shareToken: null,
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

    const nowIso = new Date().toISOString();
    const userMsg: Message = { id: newId(), role: "user", content: userText, createdAt: nowIso };
    const assistantId = newId();
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      toolCalls: [],
      loading: true,
      createdAt: nowIso,
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

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/owner/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: convId,
          thinking: thinkingMode,
          messages: historyPayload,
        }),
        signal: controller.signal,
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
      const isAbort =
        (e instanceof Error && e.name === "AbortError") ||
        (typeof e === "object" && e !== null && "name" in e && (e as { name: string }).name === "AbortError");
      const message = isAbort
        ? "Зупинено користувачем"
        : e instanceof Error
          ? e.message
          : "Помилка";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                error: isAbort ? undefined : message,
                content: m.content || (isAbort ? "_(відповідь зупинено)_" : ""),
                loading: false,
              }
            : m,
        ),
      );
    } finally {
      setPending(false);
      abortRef.current = null;
      // Збережено: показати тостер на 1.5с
      if (convId) {
        setSavedHint(true);
        setTimeout(() => setSavedHint(false), 1500);
      }
    }
  }

  const stopGeneration = () => {
    abortRef.current?.abort();
  };

  const regenerateLast = () => {
    // Знаходимо останнє user повідомлення і шлемо його ще раз,
    // попередньо видаливши останній assistant.
    if (pending) return;
    const lastUserIdx = [...messages].reverse().findIndex((m) => m.role === "user");
    if (lastUserIdx < 0) return;
    const realIdx = messages.length - 1 - lastUserIdx;
    const lastUser = messages[realIdx];
    // Прибираємо повідомлення після last user (включно з assistant)
    setMessages(messages.slice(0, realIdx));
    // Шлемо знов
    void send(lastUser.content);
  };

  const newChat = () => {
    setMessages([]);
    setConversationId(null);
    // ?new=1 щоб server-side не редиректив назад у останню розмову
    router.push("/owner/chat?new=1", { scroll: false });
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

  const renameConversation = async (id: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      await fetch(`/api/owner/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: trimmed } : c)));
    } catch {
      // ignore
    }
  };

  const togglePin = async (id: string) => {
    const cur = conversations.find((c) => c.id === id);
    if (!cur) return;
    const next = !cur.isPinned;
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isPinned: next } : c)),
    );
    try {
      await fetch(`/api/owner/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned: next }),
      });
    } catch {}
  };

  const moveToFolder = async (convId: string, folderId: string | null) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, folderId } : c)),
    );
    try {
      await fetch(`/api/owner/conversations/${convId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      });
    } catch {}
  };

  const createFolder = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    try {
      const res = await fetch("/api/owner/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) return null;
      const { folder } = (await res.json()) as { folder: FolderItem };
      setFolders((prev) => [...prev, { ...folder, conversationCount: 0 }]);
      return folder;
    } catch {
      return null;
    }
  };

  const deleteFolder = async (folderId: string) => {
    if (!confirm("Видалити теку? Розмови всередині не видаляться, лише втратять прив'язку.")) return;
    try {
      const res = await fetch(`/api/owner/folders/${folderId}`, { method: "DELETE" });
      if (!res.ok) return;
      setFolders((prev) => prev.filter((f) => f.id !== folderId));
      // Conversations залишаються — folderId стає null автоматично через DB
      setConversations((prev) =>
        prev.map((c) => (c.folderId === folderId ? { ...c, folderId: null } : c)),
      );
    } catch {}
  };

  const [shareModal, setShareModal] = useState<{ open: boolean; url: string | null }>({
    open: false,
    url: null,
  });

  const generateShareLink = async () => {
    if (!conversationId) return;
    try {
      const res = await fetch(`/api/owner/conversations/${conversationId}/share`, {
        method: "POST",
      });
      if (!res.ok) return;
      const { token } = (await res.json()) as { token: string };
      const url = `${window.location.origin}/share/${token}`;
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, shareToken: token } : c)),
      );
      setShareModal({ open: true, url });
    } catch {}
  };

  const revokeShareLink = async () => {
    if (!conversationId) return;
    try {
      await fetch(`/api/owner/conversations/${conversationId}/share`, { method: "DELETE" });
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, shareToken: null } : c)),
      );
      setShareModal({ open: false, url: null });
    } catch {}
  };

  const toggleBookmark = async (msgId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, isBookmarked: !m.isBookmarked } : m)),
    );
    try {
      await fetch(`/api/owner/messages/${msgId}/bookmark`, { method: "POST" });
    } catch {}
  };

  const exportConversationToPdf = async () => {
    const el = document.querySelector(".owner-chat-messages") as HTMLElement | null;
    if (!el) return;
    const { exportMessageToPdf } = await import("./_export");
    await exportMessageToPdf(el, `metrum-chat-${conversationId ?? Date.now()}`);
  };

  const [sidebarSearch, setSidebarSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const filteredConversations = conversations.filter((c) =>
    sidebarSearch.trim() ? c.title.toLowerCase().includes(sidebarSearch.toLowerCase()) : true,
  );

  // Групування: Pinned → Folders → Без теки
  const grouped = useMemo(() => {
    const pinned: ConversationListItem[] = [];
    const byFolder = new Map<string, ConversationListItem[]>();
    const noFolder: ConversationListItem[] = [];
    for (const c of filteredConversations) {
      if (c.isPinned) {
        pinned.push(c);
        continue;
      }
      if (c.folderId) {
        if (!byFolder.has(c.folderId)) byFolder.set(c.folderId, []);
        byFolder.get(c.folderId)!.push(c);
      } else {
        noFolder.push(c);
      }
    }
    return { pinned, byFolder, noFolder };
  }, [filteredConversations]);

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
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* Top toolbar — icon-only на mobile, нічого не виходить за межі */}
      <div className="shrink-0 flex items-center justify-between gap-1.5 px-1">
        <button
          type="button"
          onClick={() => setShowSidebar(!showSidebar)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 hover:border-white/25 text-xs text-zinc-200 cursor-pointer transition min-w-0"
          title="Історія розмов"
        >
          <History size={13} className="shrink-0" />
          <span className="truncate max-w-[120px]">{activeConvLabel}</span>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          {conversationId && messages.length > 0 && (
            <>
              <button
                type="button"
                onClick={generateShareLink}
                title="Поділитись лінком (read-only)"
                className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/10 hover:border-emerald-500/40 text-zinc-400 hover:text-emerald-300 flex items-center justify-center cursor-pointer transition"
                aria-label="Поділитись"
              >
                <Share2 size={13} />
              </button>
              <button
                type="button"
                onClick={exportConversationToPdf}
                title="Зберегти всю розмову у PDF"
                className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/10 hover:border-sky-500/40 text-zinc-400 hover:text-sky-300 flex items-center justify-center cursor-pointer transition"
                aria-label="Експорт у PDF"
              >
                <FileDownIcon size={13} />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setThinkingMode(!thinkingMode)}
            title="Глибокий аналіз — детальніша відповідь"
            aria-label="Думати"
            aria-pressed={thinkingMode}
            className={`w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition ${
              thinkingMode
                ? "bg-violet-500/20 border border-violet-500/40 text-violet-200"
                : "bg-white/[0.04] border border-white/10 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Brain size={13} />
          </button>
          <button
            type="button"
            onClick={newChat}
            title="Нова розмова"
            aria-label="Нова розмова"
            className="w-8 h-8 rounded-lg bg-violet-500 hover:bg-violet-400 text-white flex items-center justify-center cursor-pointer transition"
          >
            <Plus size={14} strokeWidth={2.4} />
          </button>
        </div>
      </div>

      {/* Sidebar drawer — рендериться у document.body через portal,
          щоб уникнути clipping від overflow-hidden parent у lockHeight mode */}
      {mounted &&
        createPortal(
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
              {/* Search input */}
              <div className="px-3 pt-2 pb-1">
                <div className="relative">
                  <Search
                    size={12}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
                  />
                  <input
                    type="text"
                    value={sidebarSearch}
                    onChange={(e) => setSidebarSearch(e.target.value)}
                    placeholder="Пошук…"
                    className="w-full pl-7 pr-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-xs text-white focus:border-violet-500/40 focus:outline-none placeholder-zinc-500"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
                {filteredConversations.length === 0 ? (
                  <div className="text-xs text-zinc-500 text-center py-8 px-3">
                    {sidebarSearch
                      ? "Розмов з такою назвою не знайдено."
                      : "Розмов поки немає. Задай перше питання — і вона з'явиться тут."}
                  </div>
                ) : (
                  <>
                    {/* Pinned */}
                    {grouped.pinned.length > 0 && (
                      <SidebarGroup
                        label="Закріплено"
                        icon={<Pin size={10} />}
                        items={grouped.pinned}
                        conversationId={conversationId}
                        editingId={editingId}
                        editingValue={editingValue}
                        setEditingId={setEditingId}
                        setEditingValue={setEditingValue}
                        switchConversation={switchConversation}
                        renameConversation={renameConversation}
                        deleteConversation={deleteConversation}
                        togglePin={togglePin}
                        moveToFolder={moveToFolder}
                        folders={folders}
                      />
                    )}

                    {/* By folder */}
                    {folders.map((f) => {
                      const items = grouped.byFolder.get(f.id) ?? [];
                      if (items.length === 0) return null;
                      return (
                        <SidebarGroup
                          key={f.id}
                          label={f.name}
                          icon={<Folder size={10} />}
                          onDelete={() => deleteFolder(f.id)}
                          items={items}
                          conversationId={conversationId}
                          editingId={editingId}
                          editingValue={editingValue}
                          setEditingId={setEditingId}
                          setEditingValue={setEditingValue}
                          switchConversation={switchConversation}
                          renameConversation={renameConversation}
                          deleteConversation={deleteConversation}
                          togglePin={togglePin}
                          moveToFolder={moveToFolder}
                          folders={folders}
                        />
                      );
                    })}

                    {/* Без теки */}
                    {grouped.noFolder.length > 0 && (
                      <SidebarGroup
                        label={folders.length > 0 ? "Інші" : ""}
                        items={grouped.noFolder}
                        conversationId={conversationId}
                        editingId={editingId}
                        editingValue={editingValue}
                        setEditingId={setEditingId}
                        setEditingValue={setEditingValue}
                        switchConversation={switchConversation}
                        renameConversation={renameConversation}
                        deleteConversation={deleteConversation}
                        togglePin={togglePin}
                        moveToFolder={moveToFolder}
                        folders={folders}
                      />
                    )}
                  </>
                )}

                {/* Add folder — inline form (PWA-safe, no native prompt) */}
                <FolderCreator onCreate={(name) => createFolder(name)} />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>,
          document.body,
        )}

      <div
        ref={scrollRef}
        className="owner-chat-messages flex-1 space-y-4 overflow-y-auto pr-1 -mr-1 scroll-smooth"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}
      >
        {messages.length === 0 && <EmptyState onPick={(q) => send(q)} />}

        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <MessageRow
              key={m.id}
              message={m}
              onSuggestionClick={(q) => send(q)}
              onToggleBookmark={() => toggleBookmark(m.id)}
            />
          ))}
        </AnimatePresence>

        {/* Regenerate — після останнього assistant, якщо є user message раніше */}
        {!pending &&
          messages.length >= 2 &&
          messages[messages.length - 1].role === "assistant" &&
          !messages[messages.length - 1].loading && (
            <div className="flex justify-start">
              <button
                type="button"
                onClick={regenerateLast}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 hover:border-violet-500/40 text-[11px] text-zinc-300 hover:text-white transition cursor-pointer"
                title="Перегенерувати відповідь"
              >
                <RefreshCcw size={11} />
                Перегенерувати
              </button>
            </div>
          )}
      </div>

      <ChatInput
        input={input}
        setInput={setInput}
        attachments={attachments}
        setAttachments={setAttachments}
        pending={pending}
        onSend={() => send(input)}
        onStop={stopGeneration}
        thinkingMode={thinkingMode}
        savedHint={savedHint}
      />

      {/* Share modal */}
      <AnimatePresence>
        {shareModal.open && shareModal.url && (
          <ShareModal
            url={shareModal.url}
            onClose={() => setShareModal({ open: false, url: null })}
            onRevoke={revokeShareLink}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ShareModal({
  url,
  onClose,
  onRevoke,
}: {
  url: string;
  onClose: () => void;
  onRevoke: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <>
      <motion.button
        type="button"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60"
        aria-label="Закрити"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] w-[90%] max-w-md rounded-2xl bg-zinc-900 border border-white/10 p-5 shadow-2xl"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <Share2 size={16} className="text-emerald-300" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Лінк створено</h3>
            <p className="text-xs text-zinc-400">Хто має посилання — побачить розмову read-only</p>
          </div>
        </div>
        <div className="rounded-xl bg-zinc-950 border border-white/10 p-3 mb-3 break-all text-xs text-zinc-200 font-mono">
          {url}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold cursor-pointer transition"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Скопійовано" : "Копіювати"}
          </button>
          <button
            type="button"
            onClick={onRevoke}
            className="px-3 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-sm font-semibold cursor-pointer transition"
          >
            Відкликати
          </button>
        </div>
      </motion.div>
    </>
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

function IconAction({
  onClick,
  title,
  active,
  activeClass = "bg-white/[0.08] text-white",
  children,
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  activeClass?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition cursor-pointer ${
        active ? activeClass : "bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300"
      }`}
    >
      {children}
    </button>
  );
}

function MessageRow({
  message,
  onSuggestionClick,
  onToggleBookmark,
}: {
  message: Message;
  onSuggestionClick?: (q: string) => void;
  onToggleBookmark?: () => void;
}) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopSpeaking = () => {
    if (typeof window !== "undefined") {
      window.speechSynthesis?.cancel();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setSpeaking(false);
  };

  const toggleSpeak = async () => {
    if (speaking) {
      stopSpeaking();
      return;
    }
    // Strip markdown — для читання потрібен plain text
    const cleaned = message.content
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/!?\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\|/g, " ")
      .replace(/[-=]{3,}/g, " ")
      .replace(/#+\s/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) return;

    // Спершу пробуємо OpenAI TTS (HD якість, людський голос).
    // Якщо не вдалось — fallback на browser SpeechSynthesis.
    setSpeaking(true);
    try {
      const res = await fetch("/api/owner/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleaned.slice(0, 4000), voice: "nova" }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          setSpeaking(false);
          URL.revokeObjectURL(url);
          audioRef.current = null;
        };
        audio.onerror = () => {
          setSpeaking(false);
          URL.revokeObjectURL(url);
          audioRef.current = null;
        };
        await audio.play();
        return;
      }
      // Fallback to browser TTS
      console.warn("[tts] OpenAI failed, falling back to browser:", res.status);
    } catch (e) {
      console.warn("[tts] network error, falling back to browser:", e);
    }

    // Browser SpeechSynthesis fallback з premium voice selection
    if (typeof window === "undefined") {
      setSpeaking(false);
      return;
    }
    const synth = window.speechSynthesis;
    if (!synth) {
      setSpeaking(false);
      return;
    }
    let voices = synth.getVoices();
    if (voices.length === 0) {
      await new Promise<void>((resolve) => {
        synth.onvoiceschanged = () => resolve();
        setTimeout(resolve, 500);
      });
      voices = synth.getVoices();
    }
    const ukVoices = voices.filter((v) => v.lang.startsWith("uk"));
    const premium = ukVoices.find((v) =>
      /premium|enhanced|natural|neural|hd/i.test(v.name),
    );
    const namedPremium = ukVoices.find((v) =>
      /lesya|olena|mariana|tetiana/i.test(v.name),
    );
    const best = premium ?? namedPremium ?? ukVoices[0] ?? null;

    const utter = new SpeechSynthesisUtterance(cleaned);
    utter.lang = "uk-UA";
    if (best) utter.voice = best;
    utter.rate = 0.95;
    utter.pitch = 1.0;
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    synth.speak(utter);
  };
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
                    if (lang === "suggestions") {
                      const items = parseSuggestions(text);
                      if (items.length > 0) {
                        return (
                          <SuggestionChips items={items} onPick={onSuggestionClick} />
                        );
                      }
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
          <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center gap-1 opacity-60 group-hover:opacity-100 transition">
            <IconAction
              onClick={handleCopy}
              title={copied ? "Скопійовано" : "Копіювати"}
              active={copied}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </IconAction>
            <IconAction
              onClick={() => exportMessageToPdf(messageRef.current, `metrum-chat-${Date.now()}`)}
              title="Зберегти як PDF"
            >
              <FileDown size={13} />
            </IconAction>
            <IconAction
              onClick={toggleSpeak}
              title={speaking ? "Зупинити озвучення" : "Озвучити голосом"}
              active={speaking}
              activeClass="bg-violet-500/20 text-violet-300"
            >
              {speaking ? <VolumeX size={13} /> : <Volume2 size={13} />}
            </IconAction>
            {onToggleBookmark && (
              <IconAction
                onClick={onToggleBookmark}
                title={
                  message.isBookmarked
                    ? "Прибрати закладку — не буде у важливому"
                    : "Закласти у важливе для швидкого пошуку"
                }
                active={!!message.isBookmarked}
                activeClass="bg-amber-500/20 text-amber-300"
              >
                {message.isBookmarked ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
              </IconAction>
            )}

            {message.createdAt && (
              <span className="text-[10px] text-zinc-600 ml-auto tabular-nums shrink-0">
                {formatMessageTime(message.createdAt)}
              </span>
            )}
          </div>
        )}

        {message.error && (
          <div className="mt-2 flex items-center gap-2 text-xs text-rose-300 bg-rose-500/10 rounded-lg px-2 py-1.5">
            <AlertCircle size={12} />
            {message.error}
          </div>
        )}

        {/* Timestamp для user messages (assistant має у action bar) */}
        {isUser && message.createdAt && (
          <div className="mt-1 text-[10px] text-violet-100/50 text-right tabular-nums">
            {formatMessageTime(message.createdAt)}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function parseSuggestions(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .slice(0, 4);
    }
    return [];
  } catch {
    return [];
  }
}

function SuggestionChips({
  items,
  onPick,
}: {
  items: string[];
  onPick?: (q: string) => void;
}) {
  if (!onPick) return null;
  return (
    <div className="not-prose mt-3 pt-2 border-t border-white/5">
      <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold flex items-center gap-1 mb-1.5">
        <Sparkles size={10} className="text-violet-400" />
        Що ще можу зробити
      </div>
      <ul className="space-y-0.5">
        {items.map((q, i) => (
          <li key={i} className="leading-relaxed">
            <button
              type="button"
              onClick={() => onPick(q)}
              className="text-left text-xs text-violet-300 hover:text-violet-200 underline decoration-violet-500/40 hover:decoration-violet-400 underline-offset-2 cursor-pointer transition"
            >
              <span className="text-zinc-600 mr-1">›</span>
              {q}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface SidebarGroupProps {
  label: string;
  icon?: React.ReactNode;
  items: ConversationListItem[];
  conversationId: string | null;
  editingId: string | null;
  editingValue: string;
  setEditingId: (id: string | null) => void;
  setEditingValue: (v: string) => void;
  switchConversation: (id: string) => void;
  renameConversation: (id: string, t: string) => void;
  deleteConversation: (id: string) => void;
  togglePin: (id: string) => void;
  moveToFolder: (convId: string, folderId: string | null) => void;
  folders: FolderItem[];
  onDelete?: () => void;
}

function SidebarGroup({
  label,
  icon,
  items,
  conversationId,
  editingId,
  editingValue,
  setEditingId,
  setEditingValue,
  switchConversation,
  renameConversation,
  deleteConversation,
  togglePin,
  moveToFolder,
  folders,
  onDelete,
}: SidebarGroupProps) {
  return (
    <div>
      {label && (
        <div className="flex items-center justify-between px-2 mb-1 group/header">
          <div className="flex items-center gap-1 text-[9px] uppercase tracking-[0.2em] text-zinc-500 font-bold">
            {icon}
            {label}
          </div>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="opacity-0 group-hover/header:opacity-100 text-zinc-500 hover:text-rose-400 p-0.5 transition cursor-pointer"
              aria-label="Видалити теку"
            >
              <Trash2 size={10} />
            </button>
          )}
        </div>
      )}
      <div className="space-y-1">
        {items.map((c) => {
          const isEditing = editingId === c.id;
          return (
            <div
              key={c.id}
              className={`group flex items-center gap-1 rounded-xl px-2 py-2 transition ${
                c.id === conversationId
                  ? "bg-violet-500/15 border border-violet-500/30"
                  : "hover:bg-white/[0.04] border border-transparent"
              }`}
            >
              {isEditing ? (
                <input
                  type="text"
                  autoFocus
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={() => {
                    if (editingValue.trim() && editingValue !== c.title) {
                      renameConversation(c.id, editingValue);
                    }
                    setEditingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (editingValue.trim() && editingValue !== c.title) {
                        renameConversation(c.id, editingValue);
                      }
                      setEditingId(null);
                    } else if (e.key === "Escape") {
                      setEditingId(null);
                    }
                  }}
                  className="flex-1 bg-zinc-950 border border-violet-500/40 text-sm text-white px-2 py-1 rounded focus:outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => switchConversation(c.id)}
                  onDoubleClick={() => {
                    setEditingId(c.id);
                    setEditingValue(c.title);
                  }}
                  className="flex-1 text-left min-w-0 cursor-pointer"
                  title="Подвійний клік — перейменувати"
                >
                  <div className="flex items-center gap-1.5">
                    {c.isPinned && <Pin size={9} className="text-amber-400 shrink-0" />}
                    {c.shareToken && <Share2 size={9} className="text-emerald-400 shrink-0" />}
                    <div className="text-sm text-white truncate">{c.title}</div>
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">
                    {c.messageCount} {c.messageCount === 1 ? "повід." : "повід."} ·{" "}
                    {new Date(c.updatedAt).toLocaleDateString("uk-UA")}
                  </div>
                </button>
              )}
              {!isEditing && (
                <div className="flex items-center opacity-0 group-hover:opacity-100 transition">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePin(c.id);
                    }}
                    className="text-zinc-500 hover:text-amber-300 p-1.5 cursor-pointer"
                    aria-label={c.isPinned ? "Відкріпити" : "Закріпити"}
                  >
                    {c.isPinned ? <PinOff size={11} /> : <Pin size={11} />}
                  </button>
                  {folders.length > 0 && (
                    <FolderMenu
                      folders={folders}
                      currentId={c.folderId}
                      onPick={(fid) => moveToFolder(c.id, fid)}
                    />
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(c.id);
                      setEditingValue(c.title);
                    }}
                    className="text-zinc-500 hover:text-violet-300 p-1.5 cursor-pointer"
                    aria-label="Перейменувати"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(c.id);
                    }}
                    className="text-zinc-500 hover:text-rose-400 p-1.5 cursor-pointer"
                    aria-label="Видалити"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FolderCreator({ onCreate }: { onCreate: (name: string) => Promise<unknown> }) {
  const [opening, setOpening] = useState(false);
  const [value, setValue] = useState("");
  const [creating, setCreating] = useState(false);

  if (!opening) {
    return (
      <button
        type="button"
        onClick={() => setOpening(true)}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/5 hover:border-violet-500/30 text-xs text-zinc-400 hover:text-zinc-200 transition cursor-pointer mt-2"
      >
        <Plus size={11} /> Нова тека
      </button>
    );
  }

  const submit = async () => {
    if (!value.trim() || creating) return;
    setCreating(true);
    await onCreate(value);
    setValue("");
    setOpening(false);
    setCreating(false);
  };

  return (
    <div className="mt-2 flex items-center gap-1.5 px-1">
      <input
        autoFocus
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Назва теки…"
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          else if (e.key === "Escape") {
            setOpening(false);
            setValue("");
          }
        }}
        className="flex-1 px-3 py-2 rounded-xl bg-zinc-950 border border-violet-500/40 text-xs text-white focus:outline-none placeholder-zinc-500"
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={!value.trim() || creating}
        className="shrink-0 w-8 h-8 rounded-xl bg-violet-500 hover:bg-violet-400 disabled:opacity-40 text-white flex items-center justify-center cursor-pointer transition"
        aria-label="Створити теку"
      >
        <Check size={13} strokeWidth={3} />
      </button>
      <button
        type="button"
        onClick={() => {
          setOpening(false);
          setValue("");
        }}
        className="shrink-0 w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 flex items-center justify-center cursor-pointer transition"
        aria-label="Скасувати"
      >
        <X size={13} />
      </button>
    </div>
  );
}

function FolderMenu({
  folders,
  currentId,
  onPick,
}: {
  folders: FolderItem[];
  currentId: string | null;
  onPick: (folderId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="text-zinc-500 hover:text-emerald-300 p-1.5 cursor-pointer"
        aria-label="Перенести у теку"
      >
        <FolderInput size={11} />
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-50"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div className="absolute right-0 top-full mt-1 z-[60] min-w-[160px] rounded-lg bg-zinc-900 border border-white/10 shadow-2xl py-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPick(null);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/[0.04] cursor-pointer ${currentId === null ? "text-white font-semibold" : "text-zinc-300"}`}
            >
              Без теки
            </button>
            {folders.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPick(f.id);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/[0.04] cursor-pointer ${currentId === f.id ? "text-white font-semibold" : "text-zinc-300"}`}
              >
                {f.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return time;
  return `${d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" })} ${time}`;
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
  onStop,
  thinkingMode,
  savedHint,
}: {
  input: string;
  setInput: (s: string) => void;
  attachments: Attachment[];
  setAttachments: (a: Attachment[]) => void;
  pending: boolean;
  onSend: () => void;
  onStop: () => void;
  thinkingMode: boolean;
  savedHint: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);

  // Auto-resize textarea: висота підлаштовується під контент до 160px.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, 160);
    el.style.height = `${next}px`;
  }, [input]);

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

  const hasContent = input.trim().length > 0 || attachments.length > 0;
  // Send button shows: Send (purple) when has content, Mic (white) when empty + voice supported, MicOff (red) when recording
  const rightButtonState: "send" | "mic" | "stop" = recording
    ? "stop"
    : hasContent || !voiceSupported
      ? "send"
      : "mic";

  return (
    <div className="shrink-0 z-20 px-1 pb-1 space-y-2 relative">
      {thinkingMode && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-500/15 border border-violet-500/30 text-[10px] uppercase tracking-wider font-bold text-violet-300 w-fit mx-auto">
          <Brain size={10} />
          Глибокий аналіз
        </div>
      )}

      {/* Attachments preview — over the input */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-1">
          {attachments.map((a, i) => (
            <div
              key={i}
              className="relative group rounded-xl overflow-hidden bg-white/[0.04] border border-white/10"
            >
              {a.type === "image" && a.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.previewUrl} alt={a.name} className="w-16 h-16 object-cover" />
              ) : (
                <div className="w-16 h-16 flex flex-col items-center justify-center text-zinc-400">
                  <FileText size={20} />
                  <span className="text-[8px] mt-0.5">PDF</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeAttachment(i)}
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center cursor-pointer"
                aria-label="Видалити"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {attachError && <div className="px-3 text-[11px] text-rose-300">{attachError}</div>}

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

      {/* Main row: [+] [pill input] [send/mic] */}
      <div className="flex items-end gap-2">
        {/* + Attach round button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={pending || attachments.length >= 5}
          className="shrink-0 w-12 h-12 rounded-full bg-zinc-800/90 hover:bg-zinc-700/90 text-zinc-200 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition active:scale-90 border border-white/5"
          aria-label="Прикріпити файл"
          title="Зображення або PDF"
        >
          <Plus size={22} strokeWidth={2.4} />
        </button>

        {/* Pill input */}
        <div
          className={`flex-1 flex items-end gap-2 rounded-3xl bg-zinc-900/85 backdrop-blur-xl border px-4 py-2 transition ${
            thinkingMode ? "border-violet-500/40" : "border-white/10"
          }`}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !pending) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder={recording ? "🎙️ Слухаю…" : "Запитати асистента"}
            rows={1}
            className="flex-1 bg-transparent resize-none py-2 text-base text-white focus:outline-none placeholder-zinc-500 leading-snug overflow-y-auto"
            style={{ minHeight: 28, maxHeight: 160 }}
          />
        </div>

        {/* Send / Mic / Stop round button */}
        {pending ? (
          // Streaming → кнопка зупинити (квадрат)
          <button
            type="button"
            onClick={onStop}
            className="shrink-0 w-12 h-12 rounded-full bg-zinc-700 text-white flex items-center justify-center cursor-pointer transition active:scale-90 shadow-[0_4px_12px_rgba(0,0,0,0.4)]"
            aria-label="Зупинити генерацію"
            title="Зупинити генерацію"
          >
            <Square size={16} strokeWidth={3} fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            onClick={
              rightButtonState === "send"
                ? onSend
                : rightButtonState === "stop"
                  ? toggleRecord
                  : toggleRecord
            }
            className={`shrink-0 w-12 h-12 rounded-full flex items-center justify-center cursor-pointer transition active:scale-90 ${
              rightButtonState === "send"
                ? "bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-[0_4px_16px_-2px_rgba(168,85,247,0.6)]"
                : rightButtonState === "stop"
                  ? "bg-rose-500 text-white animate-pulse shadow-[0_4px_12px_rgba(244,63,94,0.5)]"
                  : "bg-white text-zinc-900 shadow-[0_4px_12px_rgba(255,255,255,0.15)]"
            }`}
            aria-label={
              rightButtonState === "send"
                ? "Надіслати"
                : rightButtonState === "stop"
                  ? "Зупинити запис"
                  : "Голосовий ввід"
            }
          >
            {rightButtonState === "send" ? (
              <Send size={20} strokeWidth={2.4} />
            ) : rightButtonState === "stop" ? (
              <MicOff size={20} strokeWidth={2.4} />
            ) : (
              <Mic size={20} strokeWidth={2.4} />
            )}
          </button>
        )}
      </div>

      {/* Save hint pill */}
      <AnimatePresence>
        {savedHint && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.25 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 -mb-1 flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] uppercase tracking-wider font-bold text-emerald-300 pointer-events-none"
          >
            <Check size={10} />
            Збережено
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
