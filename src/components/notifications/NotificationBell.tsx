"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Camera,
  FileText,
  FolderUp,
  MessageSquare,
  Receipt,
  UserPlus,
  Wallet,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { relatedEntityLink } from "@/lib/notifications/links";

type NotificationDTO = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  isRead: boolean;
  relatedEntity: string | null;
  relatedId: string | null;
  createdAt: string;
};

type NotificationsResponse = {
  items: NotificationDTO[];
  unreadCount: number;
};

const typeIcons: Record<string, typeof Bell> = {
  PROJECT_UPDATED: TrendingUp,
  PROJECT_FILE_ADDED: FolderUp,
  PROJECT_PHOTO_REPORT: Camera,
  PROJECT_ESTIMATE_CREATED: Receipt,
  PROJECT_ESTIMATE_APPROVED: Receipt,
  PROJECT_MEMBER_ADDED: UserPlus,
  PROJECT_COMMENT: MessageSquare,
  COMMENT_MENTION: MessageSquare,
  CHAT_MENTION: MessageSquare,
  PHOTO_REPORT: Camera,
  PAYMENT_REMINDER: Wallet,
  STAGE_UPDATE: TrendingUp,
};

async function fetchNotifications(): Promise<NotificationsResponse> {
  const res = await fetch("/api/notifications?limit=10", {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

async function markRead(ids?: string[]): Promise<void> {
  await fetch("/api/notifications/mark-read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ids ? { ids } : {}),
  });
}

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.round((then - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat("uk", { numeric: "auto" });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 2_592_000) return rtf.format(Math.round(diffSec / 86400), "day");
  if (abs < 31_536_000) return rtf.format(Math.round(diffSec / 2_592_000), "month");
  return rtf.format(Math.round(diffSec / 31_536_000), "year");
}

export type NotificationBellVariant = "v1" | "v2";

export function NotificationBell({
  variant = "v1",
  buttonClassName,
  buttonStyle,
}: {
  variant?: NotificationBellVariant;
  buttonClassName?: string;
  buttonStyle?: React.CSSProperties;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["notifications", "bell"],
    queryFn: fetchNotifications,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const items = data?.items ?? [];
  const unreadCount = data?.unreadCount ?? 0;
  const badgeText = unreadCount > 9 ? "9+" : String(unreadCount);

  // Close dropdown on outside click / Escape
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleItemClick(n: NotificationDTO) {
    setOpen(false);
    if (!n.isRead) {
      try {
        await markRead([n.id]);
      } catch (err) {
        console.error("[NotificationBell] mark-read failed:", err);
      }
      queryClient.invalidateQueries({ queryKey: ["notifications", "bell"] });
    }
    router.push(relatedEntityLink(n));
  }

  async function handleMarkAllRead() {
    try {
      await markRead();
    } catch (err) {
      console.error("[NotificationBell] mark-all-read failed:", err);
    }
    queryClient.invalidateQueries({ queryKey: ["notifications", "bell"] });
  }

  const defaultButtonClass =
    variant === "v2"
      ? "relative rounded-lg p-2 transition hover:brightness-[0.97]"
      : "relative rounded-lg p-2 transition-colors admin-dark:text-gray-400 admin-dark:hover:bg-white/10 admin-dark:hover:text-white admin-light:text-gray-600 admin-light:hover:bg-gray-100 admin-light:hover:text-gray-900";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(defaultButtonClass, buttonClassName)}
        style={buttonStyle}
        title="Сповіщення"
        aria-label="Сповіщення"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white"
            aria-label={`${unreadCount} непрочитаних сповіщень`}
          >
            {badgeText}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-[min(360px,calc(100vw-24px))] max-w-[360px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl admin-dark:border-white/10 admin-dark:bg-gray-900"
          role="dialog"
          aria-label="Сповіщення"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 admin-dark:border-white/10">
            <h3 className="text-sm font-semibold text-gray-900 admin-dark:text-white">
              Сповіщення
            </h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs font-medium text-blue-600 hover:underline admin-dark:text-blue-400"
              >
                Прочитати всі
              </button>
            )}
          </div>

          <div className="max-h-[min(400px,60vh)] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Bell className="mx-auto h-8 w-8 text-gray-300 admin-dark:text-gray-600" />
                <p className="mt-2 text-sm text-gray-500 admin-dark:text-gray-400">
                  Немає сповіщень
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 admin-dark:divide-white/5">
                {items.map((n) => {
                  const Icon = typeIcons[n.type] ?? FileText;
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => handleItemClick(n)}
                        className={cn(
                          "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 admin-dark:hover:bg-white/5",
                          !n.isRead && "bg-blue-50/50 admin-dark:bg-blue-500/5"
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg",
                            !n.isRead
                              ? "bg-blue-100 text-blue-600 admin-dark:bg-blue-500/20 admin-dark:text-blue-400"
                              : "bg-gray-100 text-gray-500 admin-dark:bg-white/5 admin-dark:text-gray-400"
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "truncate text-sm",
                              !n.isRead
                                ? "font-semibold text-gray-900 admin-dark:text-white"
                                : "font-medium text-gray-700 admin-dark:text-gray-200"
                            )}
                          >
                            {n.title}
                          </p>
                          {n.body && (
                            <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 admin-dark:text-gray-400">
                              {n.body}
                            </p>
                          )}
                          <p className="mt-1 text-[10px] text-gray-400 admin-dark:text-gray-500">
                            {relativeTime(n.createdAt)}
                          </p>
                        </div>
                        {!n.isRead && (
                          <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-gray-100 px-4 py-2 text-center admin-dark:border-white/10">
            <Link
              href="/dashboard/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-blue-600 hover:underline admin-dark:text-blue-400"
            >
              Усі сповіщення
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
