import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

const TIME_RE = /^\d{2}:\d{2}$/;

function validateWorkPrefs(prefs: unknown): string | null {
  if (!prefs || typeof prefs !== "object") return "workPrefsJson має бути об'єктом";
  const p = prefs as Record<string, unknown>;
  if ("showTimerPill" in p && typeof p.showTimerPill !== "boolean") return "showTimerPill має бути boolean";
  if ("autoOpenActiveTasks" in p && typeof p.autoOpenActiveTasks !== "boolean") return "autoOpenActiveTasks має бути boolean";
  if ("defaultProjectId" in p && p.defaultProjectId != null && typeof p.defaultProjectId !== "string") return "defaultProjectId має бути string";
  return null;
}

function validateProductivityPrefs(prefs: unknown): string | null {
  if (!prefs || typeof prefs !== "object") return "productivityPrefsJson має бути об'єктом";
  const p = prefs as Record<string, unknown>;

  if ("workingDays" in p) {
    if (!Array.isArray(p.workingDays)) return "workingDays має бути масивом";
    for (const d of p.workingDays) {
      if (typeof d !== "number" || d < 0 || d > 6) return "workingDays має містити числа 0-6";
    }
  }
  if ("workStartTime" in p && (typeof p.workStartTime !== "string" || !TIME_RE.test(p.workStartTime))) {
    return "workStartTime має бути у форматі HH:MM";
  }
  if ("workEndTime" in p && (typeof p.workEndTime !== "string" || !TIME_RE.test(p.workEndTime))) {
    return "workEndTime має ��ути у форматі HH:MM";
  }
  if ("dailyHourNorm" in p) {
    if (typeof p.dailyHourNorm !== "number" || p.dailyHourNorm < 1 || p.dailyHourNorm > 24) {
      return "dailyHourNorm має бути числом від 1 до 24";
    }
  }

  const boolFields = [
    "timerAutoStop", "timerLongRunningReminder", "timerConfirmStop",
    "showTimeInMyTasks", "remindNoTimeLog", "remindEndOfDay",
  ];
  for (const key of boolFields) {
    if (key in p && typeof p[key] !== "boolean") return `${key} має бути boolean`;
  }

  if ("timerLongRunningMinutes" in p) {
    if (typeof p.timerLongRunningMinutes !== "number" || p.timerLongRunningMinutes < 1) {
      return "timerLongRunningMinutes ��ає бути числом >= 1";
    }
  }

  return null;
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorizedResponse();

  try {
    const body = await request.json();

    const data: Record<string, unknown> = {};

    if ("workPrefsJson" in body) {
      const err = validateWorkPrefs(body.workPrefsJson);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      data.workPrefsJson = body.workPrefsJson;
    }
    if ("productivityPrefsJson" in body) {
      const err = validateProductivityPrefs(body.productivityPrefsJson);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      data.productivityPrefsJson = body.productivityPrefsJson;
    }

    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data,
      select: {
        workPrefsJson: true,
        productivityPrefsJson: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Preferences update error:", error);
    return NextResponse.json(
      { error: "Помилка он��влення налаштувань" },
      { status: 500 }
    );
  }
}
