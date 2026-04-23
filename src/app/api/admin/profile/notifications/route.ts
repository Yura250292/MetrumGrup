import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

const VALID_CHANNELS = ["inApp", "email", "push", "telegram"] as const;
const VALID_CATEGORIES = [
  "taskAssignment", "taskStatusChange", "taskComment", "mention",
  "deadlineToday", "overdueTask", "chatMessage", "projectChange",
  "systemEvent", "financeReview",
] as const;
const VALID_MODES = ["all", "important", "silent"] as const;
const TIME_RE = /^\d{2}:\d{2}$/;

function validateNotificationPrefs(body: unknown): string | null {
  if (!body || typeof body !== "object") return "Невалідний формат даних";

  const prefs = body as Record<string, unknown>;

  // Validate channels
  if ("channels" in prefs) {
    if (!prefs.channels || typeof prefs.channels !== "object") return "channels має бути об'єктом";
    const ch = prefs.channels as Record<string, unknown>;
    for (const key of Object.keys(ch)) {
      if (!VALID_CHANNELS.includes(key as typeof VALID_CHANNELS[number])) return `Невідомий канал: ${key}`;
      if (typeof ch[key] !== "boolean") return `channels.${key} має бути boolean`;
    }
  }

  // Validate categories
  if ("categories" in prefs) {
    if (!prefs.categories || typeof prefs.categories !== "object") return "categories має бути об'єктом";
    const cats = prefs.categories as Record<string, unknown>;
    for (const catKey of Object.keys(cats)) {
      if (!VALID_CATEGORIES.includes(catKey as typeof VALID_CATEGORIES[number])) return `Невідома категорія: ${catKey}`;
      if (!cats[catKey] || typeof cats[catKey] !== "object") return `categories.${catKey} має бути об'єктом`;
      const catChannels = cats[catKey] as Record<string, unknown>;
      for (const chKey of Object.keys(catChannels)) {
        if (!VALID_CHANNELS.includes(chKey as typeof VALID_CHANNELS[number])) return `Невідомий канал у ${catKey}: ${chKey}`;
        if (typeof catChannels[chKey] !== "boolean") return `categories.${catKey}.${chKey} має бути boolean`;
      }
    }
  }

  // Validate quietHours
  if ("quietHours" in prefs && prefs.quietHours != null) {
    if (typeof prefs.quietHours !== "object") return "quietHours має бути об'єктом";
    const qh = prefs.quietHours as Record<string, unknown>;
    if (typeof qh.enabled !== "boolean") return "quietHours.enabled має бути boolean";
    if (typeof qh.start !== "string" || !TIME_RE.test(qh.start)) return "quietHours.start має бути у форматі HH:MM";
    if (typeof qh.end !== "string" || !TIME_RE.test(qh.end)) return "quietHours.end має бути у форматі HH:MM";
  }

  // Validate weekendQuiet
  if ("weekendQuiet" in prefs && prefs.weekendQuiet != null) {
    if (typeof prefs.weekendQuiet !== "boolean") return "weekendQuiet має бути boolean";
  }

  // Validate mode
  if ("mode" in prefs && prefs.mode != null) {
    if (!VALID_MODES.includes(prefs.mode as typeof VALID_MODES[number])) return `Невідомий mode: ${prefs.mode}`;
  }

  return null;
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorizedResponse();

  try {
    const body = await request.json();

    const validationError = validateNotificationPrefs(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: { notificationPrefsJson: body },
      select: { notificationPrefsJson: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Notification prefs update error:", error);
    return NextResponse.json(
      { error: "Помилка оновлення налаштувань сповіщень" },
      { status: 500 }
    );
  }
}
