import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import {
  syncProjectEstimatesToFinancing,
  ProjectNotFoundError,
} from "@/lib/financing/sync-from-estimate";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const role = session.user.role;
  if (role !== "FINANCIER" && role !== "SUPER_ADMIN" && role !== "MANAGER") {
    return forbiddenResponse();
  }

  const { id } = await params;

  try {
    const result = await syncProjectEstimatesToFinancing(id, session.user.id);
    const msg = result.estimatesProcessed
      ? `Синхронізовано ${result.estimatesProcessed} кошторисів (${result.itemsCreated} позицій)`
      : `У проєкті немає APPROVED кошторисів${result.estimatesSkipped ? ` (пропущено: ${result.estimatesSkipped})` : ""}`;
    return NextResponse.json({ data: result, message: msg });
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: "Проєкт не знайдено" }, { status: 404 });
    }
    console.error("project sync-finances failed:", error);
    const message = error instanceof Error ? error.message : "Помилка синхронізації";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
