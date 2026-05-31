import { NextRequest, NextResponse } from "next/server";
import {
  ESTIMATE_ROLES,
  forbiddenResponse,
  requireAuth,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import {
  deleteEstimateItem,
  normalizeCostType,
  updateEstimateItem,
} from "@/lib/estimates/items-service";
import { EstimateVersionLockedError } from "@/lib/estimates/version-lock";
import { findActiveProposal } from "@/lib/estimates/proposals";
import type { CostType, TaskDependencyType } from "@prisma/client";

const DEP_TYPES: TaskDependencyType[] = ["FS", "SS", "FF", "SF"];

function parseOptionalDate(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : undefined;
}

/**
 * Якщо у кошториса є active proposal (SENT/IN_NEGOTIATION/PARTIALLY_APPROVED) —
 * редагування/видалення рядків заблоковано. Фірма має натиснути "Withdraw and
 * edit" → створиться новий proposal зі snapshot після правок.
 */
async function assertNoActiveProposal(estimateId: string): Promise<NextResponse | null> {
  const activeId = await findActiveProposal(estimateId);
  if (activeId) {
    return NextResponse.json(
      {
        error:
          "Кошторис заблокований активною propositions клієнту. Спершу Withdraw, потім редагуй.",
        proposalId: activeId,
      },
      { status: 409 },
    );
  }
  return null;
}

function handleError(err: unknown) {
  if (err instanceof EstimateVersionLockedError) {
    return NextResponse.json(
      { error: "Кошторис заморожено", code: "ESTIMATE_LOCKED", versionId: err.versionId },
      { status: 409 },
    );
  }
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

    const { id: estimateId, itemId } = await ctx.params;
    const blocked = await assertNoActiveProposal(estimateId);
    if (blocked) return blocked;

    const json = await request.json();

    const patch: {
      description?: string;
      unit?: string;
      quantity?: number;
      unitPrice?: number;
      unitCost?: number | null;
      unitPriceCustomer?: number | null;
      foremanId?: string | null;
      executorText?: string | null;
      costCodeId?: string | null;
      costType?: CostType | null;
      itemType?: string | null;
      parentItemId?: string | null;
      plannedStart?: Date | null;
      plannedDurationDays?: number | null;
      plannedEnd?: Date | null;
      predecessorItemId?: string | null;
      dependencyType?: TaskDependencyType | null;
      dependencyLagDays?: number;
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
    if ("costCodeId" in json) {
      if (json.costCodeId !== null && typeof json.costCodeId !== "string") {
        return NextResponse.json({ error: "Невірний costCodeId" }, { status: 400 });
      }
      patch.costCodeId = json.costCodeId;
    }
    if ("costType" in json) {
      if (json.costType !== null && typeof json.costType !== "string") {
        return NextResponse.json({ error: "Невірний costType" }, { status: 400 });
      }
      const ct = normalizeCostType(json.costType);
      if (json.costType !== null && ct === null) {
        return NextResponse.json({ error: "Невірний costType" }, { status: 400 });
      }
      patch.costType = ct;
    }
    if ("itemType" in json) {
      if (json.itemType !== null && json.itemType !== "work" && json.itemType !== "material") {
        return NextResponse.json({ error: "itemType: 'work' | 'material' | null" }, { status: 400 });
      }
      patch.itemType = json.itemType;
    }
    if ("parentItemId" in json) {
      if (json.parentItemId !== null && typeof json.parentItemId !== "string") {
        return NextResponse.json({ error: "Невірний parentItemId" }, { status: 400 });
      }
      patch.parentItemId = json.parentItemId;
    }
    if ("unitCost" in json) {
      if (json.unitCost !== null) {
        const v = Number(json.unitCost);
        if (!Number.isFinite(v) || v < 0) {
          return NextResponse.json({ error: "Невірний unitCost" }, { status: 400 });
        }
        patch.unitCost = v;
      } else {
        patch.unitCost = null;
      }
    }
    if ("unitPriceCustomer" in json) {
      if (json.unitPriceCustomer !== null) {
        const v = Number(json.unitPriceCustomer);
        if (!Number.isFinite(v) || v < 0) {
          return NextResponse.json({ error: "Невірний unitPriceCustomer" }, { status: 400 });
        }
        patch.unitPriceCustomer = v;
      } else {
        patch.unitPriceCustomer = null;
      }
    }
    if ("foremanId" in json) {
      if (json.foremanId !== null && typeof json.foremanId !== "string") {
        return NextResponse.json({ error: "Невірний foremanId" }, { status: 400 });
      }
      patch.foremanId = json.foremanId;
    }
    if ("executorText" in json) {
      if (json.executorText !== null && typeof json.executorText !== "string") {
        return NextResponse.json({ error: "Невірний executorText" }, { status: 400 });
      }
      patch.executorText = json.executorText;
    }
    if ("plannedStart" in json) {
      const d = parseOptionalDate(json.plannedStart);
      if (d === undefined && json.plannedStart !== null) {
        return NextResponse.json({ error: "Невірна plannedStart" }, { status: 400 });
      }
      patch.plannedStart = d ?? null;
    }
    if ("plannedDurationDays" in json) {
      if (json.plannedDurationDays === null) {
        patch.plannedDurationDays = null;
      } else {
        const n = Number(json.plannedDurationDays);
        if (!Number.isInteger(n) || n < 0) {
          return NextResponse.json(
            { error: "plannedDurationDays має бути цілим >= 0" },
            { status: 400 },
          );
        }
        patch.plannedDurationDays = n;
      }
    }
    if ("plannedEnd" in json) {
      const d = parseOptionalDate(json.plannedEnd);
      if (d === undefined && json.plannedEnd !== null) {
        return NextResponse.json({ error: "Невірна plannedEnd" }, { status: 400 });
      }
      patch.plannedEnd = d ?? null;
    }
    if ("predecessorItemId" in json) {
      if (json.predecessorItemId !== null && typeof json.predecessorItemId !== "string") {
        return NextResponse.json({ error: "Невірний predecessorItemId" }, { status: 400 });
      }
      patch.predecessorItemId = json.predecessorItemId;
    }
    if ("dependencyType" in json) {
      if (json.dependencyType === null) {
        patch.dependencyType = null;
      } else if (
        typeof json.dependencyType !== "string" ||
        !DEP_TYPES.includes(json.dependencyType as TaskDependencyType)
      ) {
        return NextResponse.json(
          { error: "dependencyType: FS | SS | FF | SF | null" },
          { status: 400 },
        );
      } else {
        patch.dependencyType = json.dependencyType as TaskDependencyType;
      }
    }
    if ("dependencyLagDays" in json) {
      const n = Number(json.dependencyLagDays);
      if (!Number.isInteger(n)) {
        return NextResponse.json(
          { error: "dependencyLagDays має бути цілим" },
          { status: 400 },
        );
      }
      patch.dependencyLagDays = n;
    }

    const item = await updateEstimateItem({ itemId, patch, userId: session.user.id });
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

    const { id: estimateId, itemId } = await ctx.params;
    const blocked = await assertNoActiveProposal(estimateId);
    if (blocked) return blocked;

    await deleteEstimateItem(itemId, { userId: session.user.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
