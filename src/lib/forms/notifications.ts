/**
 * Form submission lifecycle → Telegram нотифікації.
 *
 * - SUBMITTED → DM SUPER_ADMIN/MANAGER/HR у тій самій фірмі (review queue).
 * - APPROVED / REJECTED → DM прорабу (виконавцю).
 *
 * Усе fire-and-forget — не блокуємо HTTP response. Помилки залишаються
 * у server logs (sendTelegramNotification сам логує).
 */

import { prisma } from "@/lib/prisma";
import { sendTelegramNotification } from "@/lib/notifications/telegram";

const REVIEWER_ROLES = ["SUPER_ADMIN", "MANAGER", "HR"] as const;

export async function notifySubmissionSubmitted(submissionId: string): Promise<void> {
  try {
    const sub = await prisma.formSubmission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        firmId: true,
        template: { select: { name: true } },
        project: { select: { title: true } },
        submittedBy: { select: { name: true } },
      },
    });
    if (!sub) return;
    const reviewers = await prisma.user.findMany({
      where: {
        firmId: sub.firmId ?? undefined,
        role: { in: REVIEWER_ROLES as unknown as ("SUPER_ADMIN" | "MANAGER" | "HR")[] },
        isActive: true,
      },
      select: { id: true },
    });
    const body = [
      sub.project?.title ? `Проєкт: ${sub.project.title}` : null,
      `Виконавець: ${sub.submittedBy.name}`,
    ]
      .filter(Boolean)
      .join("\n");
    await Promise.all(
      reviewers.map((u) =>
        sendTelegramNotification(u.id, {
          title: `Нова форма на розгляд: ${sub.template.name}`,
          body,
          url: `/admin-v2/queue/form-submissions/${sub.id}`,
        }),
      ),
    );
  } catch (e) {
    console.error("[forms/notifySubmissionSubmitted]", e);
  }
}

export async function notifySubmissionReviewed(
  submissionId: string,
  decision: "APPROVED" | "REJECTED",
): Promise<void> {
  try {
    const sub = await prisma.formSubmission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        submittedById: true,
        reviewNote: true,
        template: { select: { name: true } },
        reviewedBy: { select: { name: true } },
      },
    });
    if (!sub) return;
    const title =
      decision === "APPROVED"
        ? `Форму "${sub.template.name}" затверджено`
        : `Форму "${sub.template.name}" відхилено`;
    const body = [
      sub.reviewedBy?.name ? `Розглянув: ${sub.reviewedBy.name}` : null,
      sub.reviewNote ? `Коментар: ${sub.reviewNote}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    await sendTelegramNotification(sub.submittedById, {
      title,
      body,
      url: `/foreman/forms`,
    });
  } catch (e) {
    console.error("[forms/notifySubmissionReviewed]", e);
  }
}
