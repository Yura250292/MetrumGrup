import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { matchMaterial } from "@/lib/matching/material-matcher";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { ArrowLeft } from "lucide-react";
import { ReviewBoard, type LineItemView } from "./_components/review-board";

export const dynamic = "force-dynamic";

const APPROVER_ROLES = new Set(["SUPER_ADMIN", "MANAGER", "FINANCIER"]);

export default async function AdminV2ReceiptReviewPage(props: {
  params: Promise<{ scanId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { scanId } = await props.params;
  const scan = await prisma.receiptScan.findUnique({
    where: { id: scanId },
    include: {
      project: { select: { id: true, title: true, slug: true } },
      createdBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      warehouse: { select: { id: true, name: true } },
      financeEntry: { select: { id: true, status: true } },
      lineItems: {
        orderBy: { sortOrder: "asc" },
        include: {
          matchedMaterial: { select: { id: true, name: true, sku: true, unit: true, basePrice: true } },
        },
      },
    },
  });
  if (!scan) notFound();

  const enriched: LineItemView[] = await Promise.all(
    scan.lineItems.map(async (li) => {
      const showCandidates = li.status === "UNMATCHED" || li.status === "SUGGESTED";
      const candidates = showCandidates
        ? (await matchMaterial(li.rawName, { topN: 3 })).map((c) => ({
            materialId: c.material.id,
            name: c.material.name,
            sku: c.material.sku,
            unit: c.material.unit,
            basePrice: Number(c.material.basePrice),
            score: c.score,
          }))
        : [];
      return {
        id: li.id,
        rawName: li.rawName,
        rawUnit: li.rawUnit,
        quantity: Number(li.quantity),
        unitPrice: Number(li.unitPrice),
        totalPrice: li.totalPrice ? Number(li.totalPrice) : null,
        status: li.status,
        matchConfidence: li.matchConfidence,
        proposedSku: li.proposedSku,
        proposedCategory: li.proposedCategory,
        matchedMaterial: li.matchedMaterial
          ? {
              id: li.matchedMaterial.id,
              name: li.matchedMaterial.name,
              sku: li.matchedMaterial.sku,
              unit: li.matchedMaterial.unit,
            }
          : null,
        candidates,
      };
    }),
  );

  const canApprove = APPROVER_ROLES.has(session.user.role);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin-v2/receipts"
        className="inline-flex items-center gap-1.5 text-sm"
        style={{ color: T.textMuted }}
      >
        <ArrowLeft size={14} /> До списку сканів
      </Link>

      <section className="flex flex-col gap-2">
        <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
          СКАН НАКЛАДНОЇ
        </span>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
          {scan.supplier ?? "Невідомий постачальник"}
        </h1>
        <p className="text-sm" style={{ color: T.textSecondary }}>
          Проєкт:{" "}
          <Link
            href={`/admin-v2/projects/${scan.project.id}`}
            className="hover:underline"
            style={{ color: T.accentPrimary }}
          >
            {scan.project.title}
          </Link>
          {" · "}Завантажено {new Date(scan.createdAt).toLocaleDateString("uk-UA")} ·{" "}
          {scan.createdBy.name}
        </p>
      </section>

      <ReviewBoard
        scanId={scan.id}
        status={scan.status}
        rejectionReason={scan.rejectionReason}
        totalAmount={scan.totalAmount ? Number(scan.totalAmount) : null}
        currency={scan.currency}
        lineItems={enriched}
        canApprove={canApprove}
      />
    </div>
  );
}
