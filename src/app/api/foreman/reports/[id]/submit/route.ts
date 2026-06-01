import { NextResponse } from "next/server";
import { requireForeman, forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  let session, firmId;
  try {
    ({ session, firmId } = await requireForeman());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }

  const report = await prisma.foremanReport.findFirst({
    where: { id, createdById: session.user.id, firmId: firmId ?? undefined },
    include: {
      items: { select: { id: true } },
      progress: { select: { id: true } },
    },
  });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Подати можна з DRAFT або після повернення на доопрацювання (NEEDS_REVISION).
  if (report.status !== "DRAFT" && report.status !== "NEEDS_REVISION") {
    return NextResponse.json(
      { error: "Conflict", message: "Звіт уже надіслано" },
      { status: 409 },
    );
  }
  if (report.items.length === 0 && report.progress.length === 0) {
    return NextResponse.json(
      { error: "Bad request", message: "Додайте хоча б один рядок або обсяг роботи" },
      { status: 400 },
    );
  }

  await prisma.foremanReport.update({
    where: { id },
    data: {
      status: "PENDING_APPROVAL",
      submittedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
