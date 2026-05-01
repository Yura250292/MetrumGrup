"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Plus, MessageSquare, FolderKanban, Calculator, Users, Search, AlertCircle, Eye, Settings, Archive } from "lucide-react";
import { useConversations, type ChatConversation } from "@/hooks/useChat";
import { Button } from "@/components/ui/button";
import { NewConversationDialog } from "./NewConversationDialog";
import { ChatOversightSettingsDialog } from "./ChatOversightSettingsDialog";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

function getConversationTitle(c: ChatConversation): string {
  if (c.type === "DM") return c.peer?.name ?? "Видалений користувач";
  if (c.type === "PROJECT") return c.project?.title ?? c.title ?? "Канал проєкту";
  if (c.type === "GROUP") return c.title ?? "Група";
  return c.estimate ? `Кошторис ${c.estimate.number}` : c.title ?? "Канал кошторису";
}

function formatTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });
}

function ConversationRow({
  conversation,
  isActive,
}: {
  conversation: ChatConversation;
  isActive: boolean;
}) {
  const title = getConversationTitle(conversation);
  let Icon: typeof MessageSquare;
  let avatarGradient: string;

  if (conversation.type === "DM") {
    Icon = MessageSquare;
    avatarGradient = "bg-gradient-to-br from-blue-500 to-cyan-500";
  } else if (conversation.type === "PROJECT") {
    Icon = FolderKanban;
    avatarGradient = "bg-gradient-to-br from-orange-500 to-amber-500";
  } else if (conversation.type === "GROUP") {
    Icon = Users;
    avatarGradient = "bg-gradient-to-br from-fuchsia-500 to-pink-500";
  } else {
    Icon = Calculator;
    avatarGradient = "bg-gradient-to-br from-purple-500 to-violet-500";
  }
  const initials = title
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Link
      href={`/admin-v2/chat/${conversation.id}`}
      className={`flex items-start gap-3 px-3 py-3 border-b transition-colors tap-highlight-none`}
      style={{
        borderColor: T.borderSoft,
        backgroundColor: isActive ? T.accentPrimarySoft : "transparent",
      }}
    >
      <div
        className={`relative h-10 w-10 flex-shrink-0 rounded-full flex items-center justify-center text-white text-sm font-semibold ${avatarGradient}`}
      >
        {conversation.type === "DM" ? (initials || <Icon className="h-5 w-5" />) : <Icon className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <p
              className="truncate text-sm font-semibold"
              style={{ color: T.textPrimary }}
            >
              {title}
            </p>
            {conversation.isObserver && (
              <span
                className="inline-flex flex-shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                style={{
                  backgroundColor: T.accentPrimarySoft,
                  color: T.accentPrimary,
                }}
                title="Ви бачите цей чат як спостерігач"
              >
                <Eye className="h-2.5 w-2.5" />
                Спостерігач
              </span>
            )}
          </div>
          <span className="text-[11px] flex-shrink-0" style={{ color: T.textMuted }}>
            {formatTime(conversation.lastMessageAt)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="truncate text-xs" style={{ color: T.textSecondary }}>
            {conversation.lastMessage
              ? conversation.lastMessage.body ||
                (conversation.lastMessage.attachmentCount > 0
                  ? `📎 ${conversation.lastMessage.attachmentCount} ${conversation.lastMessage.attachmentCount === 1 ? "файл" : "файли"}`
                  : "")
              : "Немає повідомлень"}
          </p>
          {conversation.unreadCount > 0 && (
            <span
              className="flex-shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold"
              style={{ backgroundColor: T.accentPrimary, color: "#FFFFFF" }}
            >
              {conversation.unreadCount}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function ConversationList({ activeId }: { activeId: string | null }) {
  const { data: conversations, isLoading, isError, refetch, isFetching } = useConversations();
  const { data: session } = useSession();
  const isSuperAdmin = session?.user?.role === "SUPER_ADMIN";
  const [dialogOpen, setDialogOpen] = useState(false);
  const [oversightOpen, setOversightOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const archivedCount = useMemo(
    () => (conversations ?? []).filter((c) => c.isArchived).length,
    [conversations],
  );

  const filtered = useMemo(() => {
    if (!conversations) return [];
    const q = query.trim().toLowerCase();
    const base = conversations.filter((c) =>
      showArchived ? c.isArchived : !c.isArchived,
    );
    if (!q) return base;
    return base.filter((c) => {
      const title = getConversationTitle(c).toLowerCase();
      const last = c.lastMessage?.body?.toLowerCase() ?? "";
      return title.includes(q) || last.includes(q);
    });
  }, [conversations, query, showArchived]);

  return (
    <>
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: T.borderSoft }}
      >
        <h2 className="text-sm font-bold" style={{ color: T.textPrimary }}>
          {showArchived ? "Архів" : "Розмови"}
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="relative rounded-lg p-1.5 transition active:scale-95"
            style={{
              color: showArchived ? T.accentPrimary : T.textSecondary,
              backgroundColor: showArchived ? T.accentPrimarySoft : "transparent",
            }}
            title={showArchived ? "Показати активні розмови" : "Показати архів"}
            aria-label={showArchived ? "Показати активні розмови" : "Показати архів"}
            aria-pressed={showArchived}
          >
            <Archive className="h-4 w-4" />
            {!showArchived && archivedCount > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 inline-flex min-w-[16px] h-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold"
                style={{ backgroundColor: T.textMuted, color: "#FFFFFF" }}
              >
                {archivedCount}
              </span>
            )}
          </button>
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setOversightOpen(true)}
              className="rounded-lg p-1.5 transition active:scale-95"
              style={{ color: T.textSecondary }}
              title="Доступ до всіх чатів"
              aria-label="Налаштування доступу до всіх чатів"
            >
              <Settings className="h-4 w-4" />
            </button>
          )}
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Нова
          </Button>
        </div>
      </div>
      <div
        className="border-b px-3 py-2"
        style={{ borderColor: T.borderSoft }}
      >
        <div
          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5"
          style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderSoft}` }}
        >
          <Search className="h-4 w-4 flex-shrink-0" style={{ color: T.textMuted }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Пошук по розмовах"
            className="w-full bg-transparent text-sm outline-none"
            style={{ color: T.textPrimary }}
            aria-label="Пошук по розмовах"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {isLoading && (
          <p className="p-4 text-sm" style={{ color: T.textMuted }}>
            Завантаження...
          </p>
        )}
        {isError && !isLoading && (
          <div className="p-6 text-center">
            <AlertCircle className="mx-auto h-10 w-10" style={{ color: T.danger }} />
            <p className="mt-2 text-sm" style={{ color: T.textSecondary }}>
              Не вдалося завантажити розмови
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {isFetching ? "Повторюємо…" : "Повторити"}
            </Button>
          </div>
        )}
        {!isLoading && !isError && conversations?.length === 0 && (
          <div className="p-6 text-center">
            <MessageSquare className="mx-auto h-10 w-10" style={{ color: T.textMuted }} />
            <p className="mt-2 text-sm" style={{ color: T.textMuted }}>
              Поки немає розмов. Натисніть &quot;Нова&quot;, щоб почати.
            </p>
          </div>
        )}
        {!isLoading && !isError && conversations && conversations.length > 0 && filtered.length === 0 && (
          <p className="p-6 text-center text-sm" style={{ color: T.textMuted }}>
            {showArchived
              ? query
                ? "Нічого не знайдено в архіві"
                : "Архів порожній"
              : query
                ? "Нічого не знайдено"
                : "Усі розмови в архіві"}
          </p>
        )}
        {filtered.map((c, idx) => (
          <div
            key={c.id}
            className={idx < 24 ? "data-table-row-enter" : undefined}
            style={idx < 24 ? { animationDelay: `${idx * 24}ms` } : undefined}
          >
            <ConversationRow conversation={c} isActive={c.id === activeId} />
          </div>
        ))}
      </div>
      <NewConversationDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      {isSuperAdmin && (
        <ChatOversightSettingsDialog open={oversightOpen} onOpenChange={setOversightOpen} />
      )}
    </>
  );
}
