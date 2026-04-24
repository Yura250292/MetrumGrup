"use client";

import { useCallback, useEffect, useState } from "react";
import { Send, Loader2, Check, ExternalLink, Unplug, RefreshCw } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { DEFAULT_NOTIFICATION_PREFS } from "../_lib/constants";
import type { NotificationPrefs } from "../_lib/types";

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

async function fetchStatus(): Promise<TelegramStatus> {
  const res = await fetch("/api/admin/profile/telegram", { cache: "no-store" });
  if (!res.ok) throw new Error("Не вдалося отримати статус");
  return res.json();
}

type Props = {
  notificationPrefs: NotificationPrefs | null;
  onSaveNotifications: (prefs: NotificationPrefs) => Promise<void>;
};

export function SectionTelegram({ notificationPrefs, onSaveNotifications }: Props) {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [togglePending, setTogglePending] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchStatus();
      setStatus(data);
      if (data.linked) {
        setDeepLink(null);
        setExpiresAt(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Невідома помилка");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll while waiting for the user to press /start in Telegram.
  useEffect(() => {
    if (!deepLink || status?.linked) return;
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [deepLink, status?.linked, refresh]);

  const generateLink = async () => {
    try {
      setWorking(true);
      setError(null);
      const res = await fetch("/api/admin/profile/telegram", { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Не вдалося створити посилання");
      }
      const { deepLink: link, expiresInSec } = await res.json();
      setDeepLink(link);
      setExpiresAt(Date.now() + expiresInSec * 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setWorking(false);
    }
  };

  const unlink = async () => {
    if (!confirm("Відключити Telegram? Ви більше не отримуватимете сповіщення в бот.")) return;
    try {
      setWorking(true);
      setError(null);
      const res = await fetch("/api/admin/profile/telegram", { method: "DELETE" });
      if (!res.ok) throw new Error("Не вдалося відʼєднати");
      // Also turn the telegram channel off when unlinking — nothing to deliver
      // to, and it reflects reality if user later relinks.
      if (notificationPrefs?.channels?.telegram) {
        const next: NotificationPrefs = {
          ...notificationPrefs,
          channels: { ...notificationPrefs.channels, telegram: false },
        };
        try {
          await onSaveNotifications(next);
        } catch {
          /* non-fatal */
        }
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setWorking(false);
    }
  };

  const telegramEnabled = Boolean(notificationPrefs?.channels?.telegram);

  const toggleTelegramChannel = async () => {
    const basePrefs = notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS;
    const next: NotificationPrefs = {
      ...basePrefs,
      channels: {
        ...basePrefs.channels,
        telegram: !telegramEnabled,
      },
    };
    try {
      setTogglePending(true);
      setToggleError(null);
      await onSaveNotifications(next);
    } catch (e) {
      setToggleError(e instanceof Error ? e.message : "Не вдалось зберегти");
    } finally {
      setTogglePending(false);
    }
  };

  const linked = status?.linked;
  const tg = status?.telegram;
  const displayName = tg
    ? [tg.firstName, tg.lastName].filter(Boolean).join(" ") || tg.username || "користувач"
    : "";

  const minutesLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt - Date.now()) / 60000)) : 0;

  return (
    <section
      className="rounded-2xl p-5 md:p-6"
      style={{
        backgroundColor: T.panel,
        border: "1px solid " + T.borderSoft,
      }}
    >
      <div className="flex items-center gap-2 mb-5">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: T.accentPrimarySoft }}
        >
          <Send size={16} style={{ color: T.accentPrimary }} />
        </div>
        <h3 className="text-[15px] font-bold" style={{ color: T.textPrimary }}>
          Telegram бот
        </h3>
      </div>

      <p className="text-[13px] mb-4" style={{ color: T.textSecondary }}>
        Привʼяжіть Telegram, щоб миттєво отримувати сповіщення про нові особисті
        повідомлення, згадки (@you) у чатах, і нові призначені задачі.
      </p>

      {error && (
        <div
          className="rounded-xl px-4 py-2.5 mb-4 text-[13px]"
          style={{ backgroundColor: T.dangerSoft, color: T.danger }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-[13px]" style={{ color: T.textMuted }}>
          <Loader2 size={14} className="animate-spin" />
          Завантаження…
        </div>
      ) : linked && tg ? (
        <div className="flex flex-col gap-3">
          <div
            className="rounded-xl p-4 flex items-start gap-3"
            style={{ backgroundColor: T.successSoft }}
          >
            <Check size={18} style={{ color: T.success }} className="flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold" style={{ color: T.success }}>
                Telegram привʼязано
              </p>
              <p className="text-[12px] mt-0.5" style={{ color: T.textSecondary }}>
                {displayName}
                {tg.username ? ` · @${tg.username}` : ""}
              </p>
              <button
                type="button"
                onClick={unlink}
                disabled={working}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition"
                style={{
                  backgroundColor: T.panel,
                  color: T.danger,
                  border: "1px solid " + T.borderSoft,
                }}
              >
                <Unplug size={12} />
                Відʼєднати
              </button>
            </div>
          </div>

          {/* Master toggle: deliveries are OFF by default, user opts in. */}
          <div
            className="rounded-xl px-4 py-3 flex items-center gap-3"
            style={{
              backgroundColor: T.panelElevated,
              border: "1px solid " + T.borderSoft,
            }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
                Отримувати сповіщення в Telegram
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: T.textMuted }}>
                {telegramEnabled
                  ? "Увімкнено. Нові DM, згадки та призначені задачі будуть приходити в бот."
                  : "Вимкнено. Привʼязка є, але нічого не надсилається. Увімкніть щоб отримувати."}
              </p>
              {toggleError && (
                <p className="text-[11px] mt-1" style={{ color: T.danger }}>
                  {toggleError}
                </p>
              )}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={telegramEnabled}
              onClick={toggleTelegramChannel}
              disabled={togglePending}
              className="flex-shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-60"
              style={{
                backgroundColor: telegramEnabled ? T.accentPrimary : T.borderSoft,
              }}
            >
              <span
                className="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform"
                style={{
                  transform: telegramEnabled ? "translateX(22px)" : "translateX(2px)",
                }}
              />
              {togglePending && (
                <Loader2
                  size={10}
                  className="absolute left-1/2 -translate-x-1/2 animate-spin"
                  style={{ color: "#FFFFFF" }}
                />
              )}
            </button>
          </div>
        </div>
      ) : deepLink ? (
        <div className="flex flex-col gap-3">
          <div
            className="rounded-xl p-4"
            style={{ backgroundColor: T.accentPrimarySoft }}
          >
            <p className="text-[13px] font-semibold mb-2" style={{ color: T.textPrimary }}>
              Крок 1 — відкрийте бот і натисніть «Start»
            </p>
            <a
              href={deepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold transition"
              style={{ backgroundColor: T.accentPrimary, color: "#FFFFFF" }}
            >
              <Send size={14} />
              Відкрити Telegram
              <ExternalLink size={12} />
            </a>
            <p className="text-[11px] mt-2" style={{ color: T.textMuted }}>
              Посилання дійсне ще {minutesLeft} хв.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[12px]" style={{ color: T.textMuted }}>
            <Loader2 size={12} className="animate-spin" />
            Очікуємо підтвердження з бота…
            <button
              type="button"
              onClick={refresh}
              className="ml-auto inline-flex items-center gap-1 underline"
              style={{ color: T.accentPrimary }}
            >
              <RefreshCw size={11} />
              Перевірити
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={generateLink}
          disabled={working}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold transition disabled:opacity-60"
          style={{ backgroundColor: T.accentPrimary, color: "#FFFFFF" }}
        >
          {working ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Привʼязати Telegram
        </button>
      )}
    </section>
  );
}
