import { prisma } from "@/lib/prisma";
import type { NotificationCategory } from "./categories";

type NotificationChannel = "inApp" | "email" | "push" | "telegram";

type NotificationPrefs = {
  channels: Record<NotificationChannel, boolean>;
  categories: Record<string, Record<NotificationChannel, boolean>>;
  quietHours?: { enabled: boolean; start: string; end: string };
  weekendQuiet?: boolean;
  mode?: "all" | "important" | "silent";
};

const DEFAULT_PREFS: NotificationPrefs = {
  channels: { inApp: true, email: true, push: false, telegram: true },
  categories: {},
  mode: "all",
};

const IMPORTANT_CATEGORIES: NotificationCategory[] = [
  "taskAssignment",
  "mention",
  "deadlineToday",
  "overdueTask",
];

export type UserNotificationInfo = {
  prefs: NotificationPrefs;
  email: string;
  timezone: string;
};

/**
 * Load notification preferences for multiple users in one query.
 */
export async function getBatchUserPrefs(
  userIds: string[],
): Promise<Map<string, UserNotificationInfo>> {
  if (userIds.length === 0) return new Map();

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, timezone: true, notificationPrefsJson: true },
  });

  const map = new Map<string, UserNotificationInfo>();
  for (const u of users) {
    map.set(u.id, {
      prefs: (u.notificationPrefsJson as NotificationPrefs) ?? DEFAULT_PREFS,
      email: u.email,
      timezone: u.timezone || "Europe/Kyiv",
    });
  }
  return map;
}

/**
 * Check whether a notification should be delivered via the given channel.
 */
export function shouldDeliver(
  prefs: NotificationPrefs,
  category: NotificationCategory,
  channel: "email" | "push" | "telegram",
): boolean {
  // Global mode check
  if (prefs.mode === "silent") return false;
  if (prefs.mode === "important" && !IMPORTANT_CATEGORIES.includes(category)) return false;

  // Global channel toggle
  if (!prefs.channels?.[channel]) return false;

  // Per-category toggle
  const catPrefs = prefs.categories?.[category];
  if (catPrefs && catPrefs[channel] === false) return false;

  // If category not configured, follow global channel setting
  return true;
}

/**
 * Check if current time is within quiet hours for the user's timezone.
 */
export function isQuietHours(prefs: NotificationPrefs, timezone: string): boolean {
  if (!prefs.quietHours?.enabled) return false;

  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0");
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0");
    const currentMinutes = hour * 60 + minute;

    const [startH, startM] = prefs.quietHours.start.split(":").map(Number);
    const [endH, endM] = prefs.quietHours.end.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    // Handle overnight ranges (e.g. 22:00 - 07:00)
    if (startMinutes <= endMinutes) {
      if (currentMinutes >= startMinutes && currentMinutes < endMinutes) return true;
    } else {
      if (currentMinutes >= startMinutes || currentMinutes < endMinutes) return true;
    }

    // Weekend quiet
    if (prefs.weekendQuiet) {
      const dayFormatter = new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        weekday: "short",
      });
      const day = dayFormatter.format(now);
      if (day === "Sat" || day === "Sun") return true;
    }
  } catch {
    // If timezone parsing fails, don't block notifications
  }

  return false;
}
