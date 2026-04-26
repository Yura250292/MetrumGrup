"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Bell, Loader2, Smartphone } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { ProfileData, NotificationPrefs, NotificationCategory, NotificationChannel } from "../_lib/types";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  DEFAULT_NOTIFICATION_PREFS,
} from "../_lib/constants";
import {
  subscribeToPush,
  unsubscribeFromPush,
  isPushSupported,
  hasActivePushSubscription,
} from "@/lib/notifications/push-client";
import { Switch } from "@/components/ui/switch";

type Props = {
  profile: ProfileData;
  onSave: (prefs: Record<string, unknown>) => Promise<void>;
};

export function SectionNotifications({ profile, onSave }: Props) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(
    (profile.notificationPrefsJson as NotificationPrefs) || DEFAULT_NOTIFICATION_PREFS
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);

  useEffect(() => {
    setPushSupported(isPushSupported());
    hasActivePushSubscription().then(setPushSubscribed);
  }, []);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    (updated: NotificationPrefs) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        try {
          setSaving(true);
          setError(null);
          await onSave(updated as unknown as Record<string, unknown>);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Помилка збереження");
        } finally {
          setSaving(false);
        }
      }, 400);
    },
    [onSave]
  );

  const handlePushSubscribe = async () => {
    const ok = await subscribeToPush();
    if (ok) {
      setPushSubscribed(true);
    } else {
      setError("Не вдалося увімкнути push-сповіщення. Перевірте дозволи браузера.");
    }
  };

  const handlePushUnsubscribe = async () => {
    await unsubscribeFromPush();
    setPushSubscribed(false);
  };

  const toggleCategory = async (cat: NotificationCategory, ch: NotificationChannel) => {
    const newValue = !prefs.categories[cat]?.[ch];

    // If enabling push for the first time, trigger browser permission
    if (ch === "push" && newValue && !pushSubscribed) {
      await handlePushSubscribe();
      // If subscription failed, don't toggle
      const isNowSubscribed = await hasActivePushSubscription();
      if (!isNowSubscribed) return;
    }

    const updated = {
      ...prefs,
      categories: {
        ...prefs.categories,
        [cat]: {
          ...prefs.categories[cat],
          [ch]: newValue,
        },
      },
    };
    setPrefs(updated);
    save(updated);
  };

  const enableAll = () => {
    const categories = { ...prefs.categories };
    for (const cat of NOTIFICATION_CATEGORIES) {
      categories[cat.key] = { inApp: true, email: true, push: true, telegram: true };
    }
    const updated = { ...prefs, categories, mode: "all" as const };
    setPrefs(updated);
    save(updated);
  };

  const disableAll = () => {
    const categories = { ...prefs.categories };
    for (const cat of NOTIFICATION_CATEGORIES) {
      categories[cat.key] = { inApp: false, email: false, push: false, telegram: false };
    }
    const updated = { ...prefs, categories, mode: "silent" as const };
    setPrefs(updated);
    save(updated);
  };

  const importantOnly = () => {
    const important: NotificationCategory[] = [
      "taskAssignment",
      "mention",
      "deadlineToday",
      "overdueTask",
    ];
    const categories = { ...prefs.categories };
    for (const cat of NOTIFICATION_CATEGORIES) {
      const on = important.includes(cat.key);
      categories[cat.key] = { inApp: on, email: on, push: false, telegram: on };
    }
    const updated = { ...prefs, categories, mode: "important" as const };
    setPrefs(updated);
    save(updated);
  };

  return (
    <section
      className="rounded-2xl p-5 md:p-6"
      style={{
        backgroundColor: T.panel,
        border: "1px solid " + T.borderSoft,
      }}
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ backgroundColor: T.amberSoft }}
          >
            <Bell size={16} style={{ color: T.amber }} />
          </div>
          <h3 className="text-[15px] font-bold" style={{ color: T.textPrimary }}>
            Сповіщення
          </h3>
        </div>
        {saving && <Loader2 size={16} className="animate-spin" style={{ color: T.accentPrimary }} />}
      </div>

      {error && (
        <div
          className="rounded-xl px-4 py-2.5 mb-4 text-[13px]"
          style={{ backgroundColor: T.dangerSoft, color: T.danger }}
        >
          {error}
        </div>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mb-5">
        {[
          { label: "Увімкнути все", action: enableAll },
          { label: "Вимкнути все", action: disableAll },
          { label: "Лише важливе", action: importantOnly },
        ].map((btn) => (
          <button
            key={btn.label}
            onClick={btn.action}
            disabled={saving}
            className="rounded-lg px-3 py-1.5 text-[12px] font-medium transition disabled:opacity-50"
            style={{
              backgroundColor: T.panelElevated,
              color: T.textSecondary,
              border: "1px solid " + T.borderSoft,
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Push notification status */}
      {pushSupported && (
        <div
          className="flex items-center justify-between rounded-xl px-4 py-3 mb-5"
          style={{ backgroundColor: T.panelSoft, border: "1px solid " + T.borderSoft }}
        >
          <div className="flex items-center gap-2">
            <Smartphone size={16} style={{ color: pushSubscribed ? T.accentPrimary : T.textMuted }} />
            <span className="text-[13px]" style={{ color: T.textPrimary }}>
              Push-сповіщення
            </span>
            <span
              className="text-[11px] px-2 py-0.5 rounded-full font-medium"
              style={{
                backgroundColor: pushSubscribed ? T.accentPrimarySoft : T.borderSoft,
                color: pushSubscribed ? T.accentPrimary : T.textMuted,
              }}
            >
              {pushSubscribed ? "Активні" : "Вимкнені"}
            </span>
          </div>
          <button
            onClick={pushSubscribed ? handlePushUnsubscribe : handlePushSubscribe}
            className="rounded-lg px-3 py-1.5 text-[12px] font-medium transition"
            style={{
              backgroundColor: pushSubscribed ? T.dangerSoft : T.accentPrimarySoft,
              color: pushSubscribed ? T.danger : T.accentPrimary,
            }}
          >
            {pushSubscribed ? "Вимкнути" : "Увімкнути"}
          </button>
        </div>
      )}

      {/* Toggle grid */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th
                className="text-left text-[10px] font-bold tracking-wider uppercase pb-2"
                style={{ color: T.textMuted }}
              >
                Категорія
              </th>
              {NOTIFICATION_CHANNELS.map((ch) => (
                <th
                  key={ch.key}
                  className="text-center text-[10px] font-bold tracking-wider uppercase pb-2 px-2"
                  style={{ color: T.textMuted, minWidth: 60 }}
                >
                  {ch.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_CATEGORIES.map((cat, i) => (
              <tr
                key={cat.key}
                style={{
                  backgroundColor: i % 2 === 1 ? T.panelSoft : "transparent",
                }}
              >
                <td className="py-2.5 pr-4">
                  <span className="text-[13px]" style={{ color: T.textPrimary }}>
                    {cat.label}
                  </span>
                </td>
                {NOTIFICATION_CHANNELS.map((ch) => {
                  const checked = !!prefs.categories[cat.key]?.[ch.key];
                  return (
                    <td key={ch.key} className="text-center py-2.5 px-2">
                      <div className="inline-flex">
                        <Switch
                          checked={checked}
                          onCheckedChange={() => toggleCategory(cat.key, ch.key)}
                          disabled={saving}
                          aria-label={`${cat.label} — ${ch.label}: ${checked ? "увімкнено" : "вимкнено"}`}
                        />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
