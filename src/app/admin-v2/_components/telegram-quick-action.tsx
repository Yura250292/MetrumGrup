"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Send,
  Loader2,
  Check,
  ExternalLink,
  Settings,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type TelegramStatus = {
  linked: boolean;
  telegram: {
    telegramId: string;
    firstName: string;
    lastName: string | null;
    username: string | null;
    linkedAt: string;
  } | null;
};

type Channels = {
  inApp?: boolean;
  email?: boolean;
  push?: boolean;
  telegram?: boolean;
};

type NotificationPrefs = {
  channels?: Channels;
};

async function fetchStatus(): Promise<TelegramStatus> {
  const res = await fetch("/api/admin/profile/telegram", { cache: "no-store" });
  if (!res.ok) throw new Error("status_failed");
  return res.json();
}

async function fetchChannels(): Promise<boolean> {
  const res = await fetch("/api/admin/profile", { cache: "no-store" });
  if (!res.ok) return false;
  const data = (await res.json()) as { notificationPrefsJson?: NotificationPrefs };
  return Boolean(data.notificationPrefsJson?.channels?.telegram);
}

async function patchChannel(enabled: boolean): Promise<void> {
  const res = await fetch("/api/admin/profile/notifications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channels: { telegram: enabled } }),
  });
  if (!res.ok) throw new Error("toggle_failed");
}

export function TelegramQuickAction() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [channelEnabled, setChannelEnabled] = useState(false);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [working, setWorking] = useState(false);
  const [togglePending, setTogglePending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const [s, ch] = await Promise.all([fetchStatus(), fetchChannels()]);
      setStatus(s);
      setChannelEnabled(ch);
      if (s.linked) {
        setDeepLink(null);
        setExpiresAt(null);
      }
    } catch {
      setError("Не вдалось завантажити статус");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + refetch when opening popover
  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  // Poll while user pressed "Open Telegram" but hasn't /start'ed yet
  useEffect(() => {
    if (!deepLink || status?.linked) return;
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [deepLink, status?.linked, refresh]);

  // Click outside to close
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  // Esc to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const generateLink = async () => {
    try {
      setWorking(true);
      setError(null);
      const res = await fetch("/api/admin/profile/telegram", { method: "POST" });
      if (!res.ok) throw new Error("link_failed");
      const { deepLink: link, expiresInSec } = (await res.json()) as {
        deepLink: string;
        expiresInSec: number;
      };
      setDeepLink(link);
      setExpiresAt(Date.now() + expiresInSec * 1000);
    } catch {
      setError("Не вдалось створити посилання");
    } finally {
      setWorking(false);
    }
  };

  const toggleChannel = async () => {
    const next = !channelEnabled;
    try {
      setTogglePending(true);
      setError(null);
      await patchChannel(next);
      setChannelEnabled(next);
    } catch {
      setError("Не вдалось переключити");
    } finally {
      setTogglePending(false);
    }
  };

  const linked = status?.linked ?? false;
  const tg = status?.telegram ?? null;
  // Стан, який треба показати dot-індикатором: не прив'язано OR прив'язано але канал вимкнено
  const needsAttention = !loading && (!linked || !channelEnabled);
  const minutesLeft = expiresAt
    ? Math.max(0, Math.ceil((expiresAt - Date.now()) / 60000))
    : 0;
  const displayName = tg
    ? [tg.firstName, tg.lastName].filter(Boolean).join(" ") ||
      tg.username ||
      "користувач"
    : "";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Telegram"
        title={linked ? "Telegram прив'язано" : "Прив'язати Telegram"}
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg transition active:scale-95"
        style={{
          color: linked ? T.accentPrimary : T.textSecondary,
          backgroundColor: T.panelElevated,
        }}
      >
        <Send size={15} />
        {needsAttention && (
          <span
            className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full"
            style={{
              backgroundColor: T.danger,
              border: `1.5px solid ${T.panel}`,
            }}
            aria-hidden
          />
        )}
      </button>

      {open && (
        <div
          className="dropdown-menu-enter dropdown-menu-enter-right absolute right-0 top-full mt-2 w-[320px] rounded-xl p-4 shadow-lg z-50"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{ backgroundColor: T.accentPrimarySoft }}
            >
              <Send size={13} style={{ color: T.accentPrimary }} />
            </div>
            <p className="text-[14px] font-bold" style={{ color: T.textPrimary }}>
              Telegram бот
            </p>
          </div>

          {error && (
            <div
              className="rounded-lg px-3 py-2 mb-3 text-[12px]"
              style={{ backgroundColor: T.dangerSoft, color: T.danger }}
            >
              {error}
            </div>
          )}

          {loading ? (
            <div
              className="flex items-center gap-2 text-[12px] py-2"
              style={{ color: T.textMuted }}
            >
              <Loader2 size={13} className="animate-spin" />
              Завантаження…
            </div>
          ) : linked && tg ? (
            <div className="flex flex-col gap-3">
              <div
                className="rounded-lg p-3 flex items-start gap-2"
                style={{ backgroundColor: T.successSoft }}
              >
                <Check
                  size={15}
                  style={{ color: T.success }}
                  className="flex-shrink-0 mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[12px] font-semibold"
                    style={{ color: T.success }}
                  >
                    Прив'язано
                  </p>
                  <p
                    className="text-[11px] truncate"
                    style={{ color: T.textSecondary }}
                  >
                    {displayName}
                    {tg.username ? ` · @${tg.username}` : ""}
                  </p>
                </div>
              </div>

              <div
                className="rounded-lg px-3 py-2.5 flex items-center gap-2"
                style={{
                  backgroundColor: T.panelElevated,
                  border: `1px solid ${T.borderSoft}`,
                }}
              >
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[12px] font-semibold"
                    style={{ color: T.textPrimary }}
                  >
                    Отримувати сповіщення
                  </p>
                  <p
                    className="text-[10.5px] mt-0.5"
                    style={{ color: T.textMuted }}
                  >
                    {channelEnabled
                      ? "DM, згадки, нові задачі"
                      : "Канал вимкнено"}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={channelEnabled}
                  onClick={toggleChannel}
                  disabled={togglePending}
                  className="flex-shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-60"
                  style={{
                    backgroundColor: channelEnabled
                      ? T.accentPrimary
                      : T.borderSoft,
                  }}
                >
                  <span
                    className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                    style={{
                      transform: channelEnabled
                        ? "translateX(18px)"
                        : "translateX(2px)",
                    }}
                  />
                  {togglePending && (
                    <Loader2
                      size={9}
                      className="absolute left-1/2 -translate-x-1/2 animate-spin"
                      style={{ color: "#FFFFFF" }}
                    />
                  )}
                </button>
              </div>

              <Link
                href="/admin-v2/profile"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition"
                style={{
                  backgroundColor: T.panelElevated,
                  color: T.textSecondary,
                  border: `1px solid ${T.borderSoft}`,
                }}
              >
                <Settings size={12} />
                Налаштування у профілі
              </Link>
            </div>
          ) : deepLink ? (
            <div className="flex flex-col gap-3">
              <p
                className="text-[12px]"
                style={{ color: T.textSecondary }}
              >
                Натисніть кнопку нижче — відкриється бот, тапніть Start.
              </p>
              <a
                href={deepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition"
                style={{
                  backgroundColor: T.accentPrimary,
                  color: "#FFFFFF",
                }}
              >
                <Send size={13} />
                Відкрити Telegram
                <ExternalLink size={11} />
              </a>
              <p
                className="text-[10.5px] text-center"
                style={{ color: T.textMuted }}
              >
                Посилання дійсне ще {minutesLeft} хв.
                {" "}
                <button
                  type="button"
                  onClick={refresh}
                  className="underline"
                  style={{ color: T.textSecondary }}
                >
                  Оновити статус
                </button>
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p
                className="text-[12px]"
                style={{ color: T.textSecondary }}
              >
                Прив'яжіть Telegram, щоб отримувати сповіщення про задачі,
                @згадки та DM просто у месенджері.
              </p>
              <button
                type="button"
                onClick={generateLink}
                disabled={working}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition disabled:opacity-60"
                style={{
                  backgroundColor: T.accentPrimary,
                  color: "#FFFFFF",
                }}
              >
                {working ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Send size={13} />
                )}
                Прив'язати Telegram
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
