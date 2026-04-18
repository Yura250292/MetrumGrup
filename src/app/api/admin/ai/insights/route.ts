import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { generateInsights } from "@/lib/ai-assistant/insights";

export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  // Only admins/managers get insights
  if (!["SUPER_ADMIN", "MANAGER", "FINANCIER"].includes(session.user.role)) {
    return NextResponse.json({ insights: [] });
  }

  const insights = await generateInsights(session.user.id);
  return NextResponse.json({ insights });
}
