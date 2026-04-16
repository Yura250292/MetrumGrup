import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { listUserRates, setUserRate } from "@/lib/time/rates";

/** Only admins / managers manage rates globally. */
function canManageRates(role: string | undefined) {
  return role === "SUPER_ADMIN" || role === "MANAGER";
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: userId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  // Users can view their own rates; admins/managers can view anyone's.
  if (userId !== session.user.id && !canManageRates(session.user.role)) {
    return forbiddenResponse();
  }
  const rates = await listUserRates(userId);
  return NextResponse.json({ data: rates });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: userId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (!canManageRates(session.user.role)) return forbiddenResponse();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rate = Number(body.rate ?? NaN);
  if (!Number.isFinite(rate) || rate < 0) {
    return NextResponse.json({ error: "rate must be non-negative number" }, { status: 400 });
  }

  const created = await setUserRate({
    userId,
    projectId: body.projectId ? String(body.projectId) : null,
    rate,
    currency: body.currency ? String(body.currency) : "UAH",
    effectiveFrom: body.effectiveFrom ? new Date(String(body.effectiveFrom)) : new Date(),
  });
  return NextResponse.json({ data: created }, { status: 201 });
}
