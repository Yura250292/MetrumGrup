import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { remindRfqSchema } from "@/lib/procurement/schemas";
import {
  getPublicBaseUrl,
  sendRfqReminder,
} from "@/lib/notifications/procurement-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REMIND_ROLES = new Set(["MANAGER", "SUPER_ADMIN"]);

/**
 * Phase A: лише update lastReminderAt/remindersCount. Email-надсилання — Phase B
 * (`src/lib/notifications/email.ts` + email-template).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: rfqId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!role || !REMIND_ROLES.has(role)) return forbiddenResponse();

  const parsed = remindRfqSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid-body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { recipientIds } = parsed.data;

  const rfq = await prisma.rFQ.findFirst({
    where: { id: rfqId, purchaseRequest: { firmId: firmId ?? undefined } },
    select: { id: true, status: true, deadline: true, internalNumber: true },
  });
  if (!rfq) return NextResponse.json({ error: "not-found" }, { status: 404 });
  if (rfq.status !== "SENT" && rfq.status !== "COLLECTING") {
    return NextResponse.json({ error: "rfq-not-open" }, { status: 409 });
  }

  const recipients = await prisma.rFQRecipient.findMany({
    where: {
      rfqId,
      ...(recipientIds && recipientIds.length > 0 ? { id: { in: recipientIds } } : {}),
      bidSubmittedAt: null,
    },
    select: {
      id: true,
      emailSnapshot: true,
      accessToken: true,
      counterparty: { select: { name: true } },
    },
  });

  const updated = await prisma.rFQRecipient.updateMany({
    where: { id: { in: recipients.map((r) => r.id) } },
    data: {
      lastReminderAt: new Date(),
      remindersCount: { increment: 1 },
    },
  });

  const base = getPublicBaseUrl(req);
  await Promise.all(
    recipients.map(async (r) => {
      try {
        await sendRfqReminder({
          to: r.emailSnapshot,
          supplierName: r.counterparty?.name ?? "Постачальник",
          rfqNumber: rfq.internalNumber,
          deadline: rfq.deadline,
          publicUrl: `${base}/public/rfq/${r.accessToken}`,
        });
      } catch (err) {
        console.error("[remind] email failed:", err);
      }
    }),
  );

  return NextResponse.json({ ok: true, sent: updated.count });
}
