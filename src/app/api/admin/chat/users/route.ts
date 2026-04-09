import { NextResponse } from "next/server";
import { requireStaffAccess, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { listStaffUsers } from "@/lib/chat/service";

export async function GET() {
  try {
    const session = await requireStaffAccess();
    const users = await listStaffUsers(session.user.id);
    return NextResponse.json({ users });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return unauthorizedResponse();
    if (message === "Forbidden") return forbiddenResponse();
    console.error("[chat/users] error:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
