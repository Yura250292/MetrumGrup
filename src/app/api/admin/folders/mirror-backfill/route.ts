import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { backfillProjectMirrors } from "@/lib/folders/mirror-service";

export async function POST() {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  if (session.user.role !== "SUPER_ADMIN") return forbiddenResponse();

  const result = await backfillProjectMirrors();
  return NextResponse.json({ ok: true, ...result });
}
