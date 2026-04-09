import { NextRequest, NextResponse } from "next/server";
import {
  ESTIMATE_ROLES,
  forbiddenResponse,
  requireAuth,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import {
  deleteEstimateItem,
  updateEstimateItem,
} from "@/lib/estimates/items-service";

function handleError(err: unknown) {
  const message = err instanceof Error ? err.message : "Unknown error";
  if (message === "Unauthorized") return unauthorizedResponse();
  if (message === "Forbidden") return forbiddenResponse();
  console.error("[estimates/items] error:", err);
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const session = await requireAuth();
    if (!ESTIMATE_ROLES.includes(session.user.role)) {
      return forbiddenResponse();
    }

    const { itemId } = await ctx.params;
    const json = await request.json();

    const patch: {
      description?: string;
      unit?: string;
      quantity?: number;
      unitPrice?: number;
    } = {};

    if (typeof json.description === "string") patch.description = json.description;
    if (typeof json.unit === "string") patch.unit = json.unit;
    if (json.quantity !== undefined) {
      const q = Number(json.quantity);
      if (!Number.isFinite(q) || q < 0) {
        return NextResponse.json({ error: "Невірна кількість" }, { status: 400 });
      }
      patch.quantity = q;
    }
    if (json.unitPrice !== undefined) {
      const p = Number(json.unitPrice);
      if (!Number.isFinite(p) || p < 0) {
        return NextResponse.json({ error: "Невірна ціна" }, { status: 400 });
      }
      patch.unitPrice = p;
    }

    const item = await updateEstimateItem({ itemId, patch });
    return NextResponse.json({ item });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const session = await requireAuth();
    if (!ESTIMATE_ROLES.includes(session.user.role)) {
      return forbiddenResponse();
    }

    const { itemId } = await ctx.params;
    await deleteEstimateItem(itemId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
