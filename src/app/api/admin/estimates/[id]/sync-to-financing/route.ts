import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import {
  syncEstimateToFinancing,
  EstimateNotFoundError,
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
    const result = await syncEstimateToFinancing(id, session.user.id);
    return NextResponse.json({
      data: result,
      message: `Перенесено ${result.itemsCreated} позицій у фінансування`,
    });
  } catch (error) {
    if (error instanceof EstimateNotFoundError) {
      return NextResponse.json({ error: "Кошторис не знайдено" }, { status: 404 });
    }
    console.error("sync-to-financing failed:", error);
    const message = error instanceof Error ? error.message : "Помилка синхронізації";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
