import { NextResponse } from "next/server";
import { requireOwner, forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { getSupplierDebt } from "@/lib/owner/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  let firmId: string | null;
  try {
    ({ firmId } = await requireOwner());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }

  const suppliers = await getSupplierDebt(firmId);
  return NextResponse.json({ suppliers });
}
