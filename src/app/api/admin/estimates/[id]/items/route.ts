import { NextRequest, NextResponse } from "next/server";
import {
  ESTIMATE_ROLES,
  forbiddenResponse,
  requireAuth,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import {
  addEstimateItem,
  normalizeCostType,
} from "@/lib/estimates/items-service";

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    if (!ESTIMATE_ROLES.includes(session.user.role)) {
      return forbiddenResponse();
    }

    const { id } = await ctx.params;
    const json = await request.json();

    const sectionId = typeof json.sectionId === "string" ? json.sectionId : "";
    const description = typeof json.description === "string" ? json.description : "";
    const unit = typeof json.unit === "string" ? json.unit : "шт";
    const quantity = Number(json.quantity ?? 1);
    const unitPrice = Number(json.unitPrice ?? 0);

    if (!sectionId) {
      return NextResponse.json({ error: "sectionId обов'язковий" }, { status: 400 });
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      return NextResponse.json({ error: "Невірна кількість" }, { status: 400 });
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return NextResponse.json({ error: "Невірна ціна" }, { status: 400 });
    }

    const opts: Parameters<typeof addEstimateItem>[0] = {
      estimateId: id,
      sectionId,
      description,
      unit,
      quantity,
      unitPrice,
      userId: session.user.id,
    };

    if ("costCodeId" in json) {
      const v = json.costCodeId;
      if (v !== null && typeof v !== "string") {
        return NextResponse.json({ error: "Невірний costCodeId" }, { status: 400 });
      }
      opts.costCodeId = v;
    }
    if ("costType" in json) {
      if (json.costType !== null && typeof json.costType !== "string") {
        return NextResponse.json({ error: "Невірний costType" }, { status: 400 });
      }
      const ct = normalizeCostType(json.costType);
      if (json.costType !== null && ct === null) {
        return NextResponse.json({ error: "Невірний costType" }, { status: 400 });
      }
      opts.costType = ct;
    }

    const item = await addEstimateItem(opts);

    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return unauthorizedResponse();
    if (message === "Forbidden") return forbiddenResponse();
    console.error("[estimates/items/create] error:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
