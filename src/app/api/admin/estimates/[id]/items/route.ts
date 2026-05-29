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
import { EstimateVersionLockedError } from "@/lib/estimates/version-lock";

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
    if ("itemType" in json) {
      if (json.itemType !== null && json.itemType !== "work" && json.itemType !== "material") {
        return NextResponse.json({ error: "itemType: 'work' | 'material' | null" }, { status: 400 });
      }
      opts.itemType = json.itemType;
    }
    if ("parentItemId" in json) {
      if (json.parentItemId !== null && typeof json.parentItemId !== "string") {
        return NextResponse.json({ error: "Невірний parentItemId" }, { status: 400 });
      }
      opts.parentItemId = json.parentItemId;
    }
    if ("unitCost" in json) {
      if (json.unitCost !== null) {
        const v = Number(json.unitCost);
        if (!Number.isFinite(v) || v < 0) {
          return NextResponse.json({ error: "Невірний unitCost" }, { status: 400 });
        }
        opts.unitCost = v;
      } else {
        opts.unitCost = null;
      }
    }
    if ("unitPriceCustomer" in json) {
      if (json.unitPriceCustomer !== null) {
        const v = Number(json.unitPriceCustomer);
        if (!Number.isFinite(v) || v < 0) {
          return NextResponse.json({ error: "Невірний unitPriceCustomer" }, { status: 400 });
        }
        opts.unitPriceCustomer = v;
      } else {
        opts.unitPriceCustomer = null;
      }
    }
    if ("foremanId" in json) {
      if (json.foremanId !== null && typeof json.foremanId !== "string") {
        return NextResponse.json({ error: "Невірний foremanId" }, { status: 400 });
      }
      opts.foremanId = json.foremanId;
    }
    if ("executorText" in json) {
      if (json.executorText !== null && typeof json.executorText !== "string") {
        return NextResponse.json({ error: "Невірний executorText" }, { status: 400 });
      }
      opts.executorText = json.executorText;
    }

    const item = await addEstimateItem(opts);

    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    if (err instanceof EstimateVersionLockedError) {
      return NextResponse.json(
        { error: "Кошторис заморожено", code: "ESTIMATE_LOCKED", versionId: err.versionId },
        { status: 409 },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return unauthorizedResponse();
    if (message === "Forbidden") return forbiddenResponse();
    console.error("[estimates/items/create] error:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
