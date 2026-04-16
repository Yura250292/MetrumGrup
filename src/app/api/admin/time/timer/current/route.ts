import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { getActiveTimer } from "@/lib/time/timer";

export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();
  const active = await getActiveTimer(session.user.id);
  return NextResponse.json({ data: active });
}
