import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { prisma } from "@/lib/prisma";
import { LightShell, HeaderMenuButton } from "../../../../../_components/v2/light-shell";
import { ReviewFormV2, type ReviewItemInput } from "./_form-v2";
import { getForemanGetUrl } from "@/lib/foreman/r2";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ projectId: string; reportId: string }>;
}

export default async function ForemanReviewPage({ params }: PageProps) {
  const { projectId, reportId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { firmId } = await resolveFirmScopeForRequest(session);

  const report = await prisma.foremanReport.findFirst({
    where: {
      id: reportId,
      projectId,
      createdById: session.user.id,
      firmId: firmId ?? undefined,
    },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: { counterparty: { select: { id: true, name: true } } },
      },
      project: {
        select: {
          id: true,
          title: true,
          folderId: true,
          currentStageRecordId: true,
        },
      },
      attachments: {
        select: {
          id: true,
          r2Key: true,
          originalName: true,
          mimeType: true,
          size: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
      stage: {
        select: { id: true, stage: true, customName: true, sortOrder: true },
      },
    },
  });

  if (!report) notFound();
  if (report.status !== "DRAFT") {
    redirect("/foreman/history");
  }

  // Витягуємо stage info: пріоритет — stage звіту, фолбек на currentStage проєкту.
  let stageName: string | null = null;
  let stageHint: string | null = null;
  const currentStageId = report.stage?.id ?? report.project.currentStageRecordId;
  if (currentStageId) {
    const [stageRec, siblings] = await Promise.all([
      report.stage ??
        prisma.projectStageRecord.findUnique({
          where: { id: currentStageId },
          select: { id: true, stage: true, customName: true, sortOrder: true },
        }),
      prisma.projectStageRecord.findMany({
        where: { projectId: report.project.id, isHidden: false, kind: "STAGE" },
        select: { id: true, sortOrder: true },
        orderBy: { sortOrder: "asc" },
      }),
    ]);
    if (stageRec) {
      stageName = stageRec.customName ?? stageLabel(stageRec.stage);
      const idx = siblings.findIndex((s) => s.id === stageRec.id);
      if (idx >= 0 && siblings.length > 0) {
        stageHint = `${idx + 1} з ${siblings.length}`;
      }
    }
  }

  // Pre-signed URLs для photo preview (image MIME).
  const attachmentsWithUrls = await Promise.all(
    report.attachments.map(async (a) => ({
      id: a.id,
      originalName: a.originalName,
      mimeType: a.mimeType,
      size: a.size,
      createdAt: a.createdAt,
      thumbUrl: a.mimeType.startsWith("image/")
        ? await getForemanGetUrl(a.r2Key, 1800).catch(() => null)
        : null,
    })),
  );

  const initialItems: ReviewItemInput[] = report.items.map((i) => ({
    id: i.id,
    costType: i.costType,
    title: i.title,
    unit: i.unit,
    quantity: i.quantity?.toString() ?? null,
    unitPrice: i.unitPrice?.toString() ?? null,
    amount: i.amount.toString(),
    currency: i.currency,
    confidence: i.confidence,
    counterpartyId: i.counterpartyId,
    supplierGuess: i.supplierGuess,
    counterpartyName: i.counterparty?.name ?? null,
    priceIncreaseFlag: i.priceIncreaseFlag,
    previousUnitPrice: i.previousUnitPrice?.toString() ?? null,
  }));

  return (
    <LightShell
      title="Новий звіт"
      backHref={`/foreman/report/project/${projectId}`}
      rightSlot={<HeaderMenuButton />}
      hideBottomNav
    >
      <ReviewFormV2
        reportId={report.id}
        projectId={report.project.id}
        projectTitle={report.project.title}
        initialItems={initialItems}
        attachments={attachmentsWithUrls}
        stageName={stageName}
        stageHint={stageHint}
      />
    </LightShell>
  );
}

function stageLabel(stage: string | null): string | null {
  if (!stage) return null;
  const MAP: Record<string, string> = {
    DESIGN: "Проєктування",
    PREPARATION: "Підготовка",
    DEMOLITION: "Демонтаж",
    ROUGH: "Чорнові роботи",
    ENGINEERING: "Інженерні мережі",
    FINISH: "Чистові роботи",
    FACADE: "Фасадні роботи",
    LANDSCAPE: "Благоустрій",
    HANDOVER: "Здача обʼєкту",
  };
  return MAP[stage] ?? stage;
}
