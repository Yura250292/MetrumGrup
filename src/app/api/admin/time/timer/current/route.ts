import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { getActiveTimer } from "@/lib/time/timer";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return unauthorizedResponse();
    const active = await getActiveTimer(session.user.id);
    return NextResponse.json({ data: active });
  } catch (err) {
    console.error("[timer/current] error:", err);
    return NextResponse.json({ data: null }, { status: 200 });
  }
}
