"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, ArrowRight } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { chatKeys, type ChatConversation } from "@/hooks/useChat";
import { formatRelativeTime } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";

export function ChatsWidget() {
  const { data, isLoading } = useQuery({
    queryKey: chatKeys.conversations(),
    queryFn: async () => {
      const res = await fetch("/api/admin/chat/conversations");
      if (!res.ok) throw new Error("Не вдалося завантажити чати");
      return (await res.json()) as { conversations: ChatConversation[] };
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const conversations = (data?.conversations ?? [])
    .slice()
    .sort((a, b) => {
      if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
      const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bt - at;
    })
    .slice(0, 5);

  const totalUnread = (data?.conversations ?? []).reduce((n, c) => n + c.unreadCount, 0);

  return (
    <WidgetShell
      icon={<MessageSquare size={14} />}
      title="Чати"
      badge={totalUnread > 0 ? String(totalUnread) : undefined}
      action={{ href: "/admin-v2/chat", label: "Усі" }}
    >
      {isLoading ? (
        <SkeletonList />
      ) : conversations.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col gap-1">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin-v2/chat/${c.id}`}
                className="flex min-h-[44px] items-start gap-2.5 rounded-lg px-2 py-2 transition hover:brightness-[0.97] touch-manipulation"
                style={{ backgroundColor: "transparent" }}
              >
                <div
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                  style={{ backgroundColor: T.accentPrimary + "18", color: T.accentPrimary }}
                >
                  {initialOf(displayName(c))}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="truncate text-[12.5px] font-semibold"
                      style={{ color: T.textPrimary }}
                    >
                      {displayName(c)}
                    </span>
                    {c.lastMessageAt && (
                      <span className="text-[10.5px]" style={{ color: T.textMuted }}>
                        {formatRelativeTime(new Date(c.lastMessageAt))}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span
                      className="truncate text-[11.5px]"
                      style={{ color: c.unreadCount > 0 ? T.textPrimary : T.textMuted }}
                    >
                      {c.lastMessage?.body?.slice(0, 80) || "Немає повідомлень"}
                    </span>
                    {c.unreadCount > 0 && (
                      <span
                        className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                        style={{ backgroundColor: T.accentPrimary }}
                      >
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}

function displayName(c: ChatConversation): string {
  if (c.title) return c.title;
  if (c.peer) return c.peer.name;
  if (c.project) return c.project.title;
  if (c.estimate) return `Кошторис ${c.estimate.number}`;
  return "Розмова";
}

function initialOf(name: string): string {
  const t = name.trim();
  return t ? t[0].toUpperCase() : "•";
}

function SkeletonList() {
  return (
    <ul className="flex flex-col gap-2">
      {[0, 1, 2, 3].map((i) => (
        <li
          key={i}
          className="h-10 rounded-lg"
          style={{ backgroundColor: T.panelElevated, opacity: 0.5 }}
        />
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 py-6 text-center">
      <MessageSquare size={20} style={{ color: T.textMuted }} />
      <span className="text-[12px]" style={{ color: T.textMuted }}>
        Немає активних чатів
      </span>
      <Link
        href="/admin-v2/chat"
        className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold"
        style={{ color: T.accentPrimary }}
      >
        Почати розмову <ArrowRight size={12} />
      </Link>
    </div>
  );
}
