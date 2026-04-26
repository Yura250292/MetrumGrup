"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { ArrowLeft, Calculator, ChevronDown, Copy, FileText, FolderKanban, Loader2, Mail, MessageSquare, Sparkles, Users, Wand2, X } from "lucide-react";
import {
  useConversation,
  useMarkRead,
  useMessages,
  useToggleMessageReaction,
  type ChatMessage,
} from "@/hooks/useChat";
import { MessageComposer } from "./MessageComposer";
import { ReactionBar } from "@/components/collab/ReactionBar";
import { RenderCommentBody } from "@/components/collab/RenderCommentBody";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { UserAvatar } from "@/components/ui/UserAvatar";

function formatStamp(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AudioAttachment({
  attachment,
  isOwn,
}: {
  attachment: ChatMessage["attachments"][number];
  isOwn: boolean;
}) {
  const [transcript, setTranscript] = useState<string | null>(attachment.transcript ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(Boolean(attachment.transcript));

  const mutedColor = isOwn ? "rgba(255,255,255,0.75)" : T.textMuted;
  const chipBg = isOwn ? "rgba(255,255,255,0.15)" : T.panel;
  const chipBorder = isOwn ? "rgba(255,255,255,0.25)" : T.borderSoft;

  const handleTranscribe = async () => {
    if (loading) return;
    if (transcript) {
      setOpen((v) => !v);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(
        `/api/admin/chat/attachments/${attachment.id}/transcribe`,
        { method: "POST" },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Не вдалось транскрибувати");
      }
      const { transcript: text } = (await res.json()) as { transcript: string };
      setTranscript(text);
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <audio controls src={attachment.url} className="max-w-[280px]" preload="metadata" />
      <div className="flex items-center gap-2 text-[10px]">
        <span style={{ color: mutedColor }}>{attachment.name}</span>
        <button
          type="button"
          onClick={handleTranscribe}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition active:scale-95 disabled:opacity-60"
          style={{
            backgroundColor: chipBg,
            color: isOwn ? "#FFFFFF" : T.accentPrimary,
            border: `1px solid ${chipBorder}`,
          }}
          title={transcript ? "Показати / сховати текст" : "AI транскрипт"}
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : transcript ? (
            <ChevronDown
              className="h-3 w-3 transition-transform"
              style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
            />
          ) : (
            <Wand2 className="h-3 w-3" />
          )}
          <span>{transcript ? (open ? "Сховати" : "Показати текст") : "Транскрипт"}</span>
        </button>
      </div>
      {error && (
        <p className="text-[11px]" style={{ color: isOwn ? "#fecaca" : T.danger }}>
          {error}
        </p>
      )}
      {open && transcript && (
        <div
          className="rounded-lg px-2.5 py-2 text-[12px] whitespace-pre-wrap max-w-[280px]"
          style={{
            backgroundColor: chipBg,
            color: isOwn ? "#FFFFFF" : T.textPrimary,
            border: `1px solid ${chipBorder}`,
          }}
        >
          {transcript}
        </div>
      )}
    </div>
  );
}

function AttachmentBlock({
  attachment,
  isOwn,
}: {
  attachment: ChatMessage["attachments"][number];
  isOwn: boolean;
}) {
  if (attachment.mimeType.startsWith("image/")) {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden rounded-xl"
        style={{ maxWidth: 260 }}
      >
        <img
          src={attachment.url}
          alt={attachment.name}
          className="block max-h-60 w-full object-cover"
          loading="lazy"
        />
      </a>
    );
  }

  if (attachment.mimeType.startsWith("audio/")) {
    return <AudioAttachment attachment={attachment} isOwn={isOwn} />;
  }

  if (attachment.mimeType.startsWith("video/")) {
    return (
      <video
        controls
        src={attachment.url}
        className="max-h-60 rounded-xl"
        style={{ maxWidth: 280 }}
        preload="metadata"
      />
    );
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      download={attachment.name}
      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs"
      style={{
        backgroundColor: isOwn ? "rgba(255,255,255,0.15)" : T.panel,
        color: isOwn ? "#FFFFFF" : T.textPrimary,
        border: `1px solid ${isOwn ? "rgba(255,255,255,0.25)" : T.borderSoft}`,
        maxWidth: 240,
      }}
    >
      <FileText className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1 truncate">{attachment.name}</span>
      <span style={{ color: isOwn ? "rgba(255,255,255,0.75)" : T.textMuted }}>
        {formatFileSize(attachment.size)}
      </span>
    </a>
  );
}

function MessageBubble({
  message,
  isOwn,
  onToggleReaction,
}: {
  message: ChatMessage;
  isOwn: boolean;
  onToggleReaction: (emoji: string) => void;
}) {
  const isAi = Boolean(message.author.isAi);
  const aiGradient = "linear-gradient(135deg, #f97316, #ec4899)";
  return (
    <div className={`flex gap-2 ${isOwn ? "flex-row-reverse" : ""}`}>
      {isAi ? (
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
          style={{ backgroundImage: aiGradient }}
          title="AI асистент"
        >
          <Sparkles className="h-4 w-4" style={{ color: "#FFFFFF" }} />
        </div>
      ) : (
        <UserAvatar
          src={message.author.avatar}
          name={message.author.name}
          userId={message.author.id}
          size={32}
          gradient={isOwn
            ? "linear-gradient(135deg, #3b82f6, #06b6d4)"
            : "linear-gradient(135deg, #a855f7, #7c3aed)"}
        />
      )}
      <div className={`flex flex-col max-w-[70%] ${isOwn ? "items-end" : "items-start"}`}>
        {!isOwn && (
          <span
            className="text-[11px] mb-0.5 inline-flex items-center gap-1"
            style={{ color: isAi ? "#ec4899" : T.textSecondary }}
          >
            {isAi && <Sparkles className="h-2.5 w-2.5" />}
            {message.author.name}
          </span>
        )}
        {(message.body || message.attachments.length === 0) && (
          <div
            className="rounded-2xl px-3 py-2 text-sm break-words"
            style={
              isOwn
                ? { backgroundColor: T.accentPrimary, color: "#FFFFFF" }
                : isAi
                  ? { backgroundColor: "rgba(236, 72, 153, 0.08)", color: T.textPrimary, border: "1px solid rgba(236, 72, 153, 0.25)" }
                  : { backgroundColor: T.panelElevated, color: T.textPrimary }
            }
          >
            <RenderCommentBody body={message.body} mentions={[]} />
          </div>
        )}
        {message.attachments.length > 0 && (
          <div className={`mt-1 flex flex-col gap-1.5 ${isOwn ? "items-end" : "items-start"}`}>
            {message.attachments.map((a) => (
              <AttachmentBlock key={a.id} attachment={a} isOwn={isOwn} />
            ))}
          </div>
        )}
        <span className="text-[10px] mt-0.5" style={{ color: T.textMuted }}>
          {formatStamp(message.createdAt)}
        </span>
        <div className="mt-1">
          <ReactionBar
            reactions={message.reactions ?? []}
            onToggle={onToggleReaction}
            size="sm"
          />
        </div>
      </div>
    </div>
  );
}

export function MessageThread({ conversationId }: { conversationId: string }) {
  const { data: session } = useSession();
  const { data: conversation } = useConversation(conversationId);
  const { data: messagesData, isLoading } = useMessages(conversationId);
  const markRead = useMarkRead(conversationId);
  const toggleReaction = useToggleMessageReaction(conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastReadCountRef = useRef(0);

  const [letterOpen, setLetterOpen] = useState(false);
  const [letterTone, setLetterTone] = useState<"formal" | "friendly" | "concise">("formal");
  const [letterLanguage, setLetterLanguage] = useState<"uk" | "en">("uk");
  const [letterText, setLetterText] = useState<string | null>(null);
  const [letterLoading, setLetterLoading] = useState(false);
  const [letterError, setLetterError] = useState<string | null>(null);
  const [letterCopied, setLetterCopied] = useState(false);

  const runLetter = async () => {
    try {
      setLetterLoading(true);
      setLetterError(null);
      setLetterText(null);
      setLetterCopied(false);

      const recent = (messagesData?.messages ?? []).slice(-20);
      if (recent.length === 0) {
        setLetterError("У розмові немає повідомлень");
        setLetterLoading(false);
        return;
      }
      const res = await fetch("/api/admin/chat/ai/letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          messageIds: recent.map((m) => m.id),
          tone: letterTone,
          language: letterLanguage,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Не вдалось згенерувати лист");
      }
      const { letter } = (await res.json()) as { letter: string };
      setLetterText(letter);
    } catch (e) {
      setLetterError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setLetterLoading(false);
    }
  };

  const copyLetter = async () => {
    if (!letterText) return;
    try {
      await navigator.clipboard.writeText(letterText);
      setLetterCopied(true);
      setTimeout(() => setLetterCopied(false), 2000);
    } catch {
      setLetterError("Не вдалось скопіювати");
    }
  };

  const messages = messagesData?.messages ?? [];

  // Auto-scroll to bottom when messages change (only if user is near bottom)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (isNearBottom || lastReadCountRef.current === 0) {
      el.scrollTop = el.scrollHeight;
    }
    lastReadCountRef.current = messages.length;
  }, [messages.length]);

  // Mark read on mount and when new messages arrive
  useEffect(() => {
    if (!conversationId || messages.length === 0) return;
    markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, messages.length]);

  const currentUserId = session?.user?.id;

  let title = "Розмова";
  let Icon = MessageSquare;
  let subtitleHref: string | null = null;
  let subtitleText: string | null = null;

  if (conversation?.type === "DM") {
    title = conversation.peer?.name ?? "Розмова";
    Icon = MessageSquare;
  } else if (conversation?.type === "PROJECT") {
    title = conversation.project?.title ?? conversation.title ?? "Канал проєкту";
    Icon = FolderKanban;
    if (conversation.project) {
      subtitleHref = `/admin-v2/projects/${conversation.project.id}`;
      subtitleText = "Відкрити проєкт \u2192";
    }
  } else if (conversation?.type === "GROUP") {
    title = conversation.title ?? "Група";
    Icon = Users;
  } else if (conversation?.type === "ESTIMATE") {
    title = conversation.estimate
      ? `Кошторис ${conversation.estimate.number}: ${conversation.estimate.title}`
      : conversation.title ?? "Канал кошторису";
    Icon = Calculator;
    if (conversation.estimate) {
      subtitleHref = `/admin-v2/estimates/${conversation.estimate.id}`;
      subtitleText = "Відкрити кошторис \u2192";
    }
  }

  return (
    <div className="relative flex h-full flex-col">
      {/* Header */}
      <div
        className="flex items-center gap-3 border-b px-4 py-3"
        style={{ borderColor: T.borderSoft }}
      >
        <Link
          href="/admin-v2/chat"
          className="md:hidden rounded-lg p-1 transition active:scale-95 tap-highlight-none"
          style={{ color: T.textSecondary }}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Icon className="h-5 w-5" style={{ color: T.textSecondary }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" style={{ color: T.textPrimary }}>
            {title}
          </p>
          {subtitleHref && subtitleText && (
            <Link
              href={subtitleHref}
              className="text-[11px] hover:underline"
              style={{ color: T.accentPrimary }}
            >
              {subtitleText}
            </Link>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setLetterOpen(true);
            setLetterText(null);
            setLetterError(null);
          }}
          title="Згенерувати лист на основі розмови"
          className="flex-shrink-0 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition active:scale-95"
          style={{
            color: T.textSecondary,
            backgroundColor: T.panelElevated,
          }}
        >
          <Mail className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Лист</span>
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Повідомлення розмови"
        className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-3"
      >
        {isLoading && (
          <p className="text-center text-sm" style={{ color: T.textMuted }}>
            Завантаження...
          </p>
        )}
        {!isLoading && messages.length === 0 && (
          <p className="text-center text-sm" style={{ color: T.textMuted }}>
            Поки немає повідомлень. Напишіть перше!
          </p>
        )}
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            isOwn={m.authorId === currentUserId}
            onToggleReaction={(emoji) =>
              toggleReaction.mutate({ messageId: m.id, emoji })
            }
          />
        ))}
      </div>

      {/* Composer */}
      <MessageComposer conversationId={conversationId} />

      {/* AI Letter Dialog (overlay) */}
      {letterOpen && (
        <div
          className="absolute inset-0 z-40 flex flex-col"
          style={{ backgroundColor: T.panel }}
        >
          <div
            className="flex items-center justify-between gap-3 border-b px-4 py-3"
            style={{ borderColor: T.borderSoft }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Mail className="h-4 w-4 flex-shrink-0" style={{ color: T.accentPrimary }} />
              <p className="truncate text-sm font-semibold" style={{ color: T.textPrimary }}>
                AI-лист з розмови
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLetterOpen(false)}
              className="rounded-lg p-1 transition active:scale-95"
              style={{ color: T.textSecondary }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 border-b px-4 py-2" style={{ borderColor: T.borderSoft }}>
            <select
              value={letterTone}
              onChange={(e) => setLetterTone(e.target.value as typeof letterTone)}
              disabled={letterLoading}
              className="rounded-lg px-2 py-1 text-[12px] outline-none"
              style={{
                backgroundColor: T.panelElevated,
                color: T.textPrimary,
                border: `1px solid ${T.borderSoft}`,
              }}
            >
              <option value="formal">Офіційний</option>
              <option value="friendly">Дружній</option>
              <option value="concise">Стислий</option>
            </select>
            <select
              value={letterLanguage}
              onChange={(e) => setLetterLanguage(e.target.value as typeof letterLanguage)}
              disabled={letterLoading}
              className="rounded-lg px-2 py-1 text-[12px] outline-none"
              style={{
                backgroundColor: T.panelElevated,
                color: T.textPrimary,
                border: `1px solid ${T.borderSoft}`,
              }}
            >
              <option value="uk">Українською</option>
              <option value="en">English</option>
            </select>
            <button
              type="button"
              onClick={runLetter}
              disabled={letterLoading}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-[12px] font-semibold transition active:scale-95 disabled:opacity-60"
              style={{ backgroundColor: T.accentPrimary, color: "#FFFFFF" }}
            >
              {letterLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {letterText ? "Перегенерувати" : "Згенерувати"}
            </button>
            {letterText && (
              <button
                type="button"
                onClick={copyLetter}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-[12px] font-semibold transition active:scale-95"
                style={{ backgroundColor: T.panelElevated, color: T.textPrimary, border: `1px solid ${T.borderSoft}` }}
              >
                <Copy className="h-3.5 w-3.5" />
                {letterCopied ? "Скопійовано" : "Копіювати"}
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4">
            {!letterLoading && !letterText && !letterError && (
              <p className="text-sm" style={{ color: T.textMuted }}>
                Обери тон і мову → «Згенерувати». AI підготує лист на основі останніх ~20 повідомлень розмови.
              </p>
            )}
            {letterLoading && (
              <div className="flex items-center gap-2 text-sm" style={{ color: T.textMuted }}>
                <Loader2 className="h-4 w-4 animate-spin" />
                Готую лист…
              </div>
            )}
            {letterError && (
              <p className="text-sm" style={{ color: T.danger }}>
                {letterError}
              </p>
            )}
            {!letterLoading && letterText && (
              <div
                className="prose prose-sm max-w-none admin-dark:prose-invert"
                style={{ color: T.textPrimary }}
              >
                <ReactMarkdown>{letterText}</ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
