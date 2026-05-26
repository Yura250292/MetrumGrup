import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/// Pending-counts для групи «Вхідні» у sidebar admin-v2. Один запит → 4 числа.
/// Кожна гілка — окремий count з firm-scope. Якщо роль не має доступу до
/// конкретного дашборду — повертаємо 0 (UI просто не покаже бейдж).
export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);

  const canSeeForeman = role === "SUPER_ADMIN" || role === "FINANCIER";
  const canSeeSuppliers =
    role === "SUPER_ADMIN" || role === "MANAGER" || role === "FINANCIER";
  // Receipts і form submissions бачать ширше коло — beach-mark: usable by anyone
  // with admin-v2 access. RBAC на самих сторінках лишається unchanged.
  const canSeeReceipts = role != null;
  const canSeeForms = role != null;

  const firmScope = firmId ?? undefined;

  const [foremanReports, documents, receipts, formSubmissions] = await Promise.all([
    canSeeForeman
      ? prisma.foremanReport.count({
          where: { firmId: firmScope, status: "PENDING_APPROVAL" },
        })
      : 0,
    canSeeSuppliers && firmId
      ? prisma.incomingDocument.count({
          where: { firmId, status: "PARSED" },
        })
      : 0,
    canSeeReceipts
      ? prisma.receiptScan.count({
          where: {
            status: "PENDING",
            ...(firmId ? { project: { firmId } } : {}),
          },
        })
      : 0,
    canSeeForms
      ? prisma.formSubmission.count({
          where: { firmId: firmScope, status: "SUBMITTED" },
        })
      : 0,
  ]);

  return NextResponse.json({
    foremanReports,
    documents,
    receipts,
    formSubmissions,
  });
}
