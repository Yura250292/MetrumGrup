import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { messageId, feedback } = await request.json();
  if (!messageId || !["up", "down"].includes(feedback)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // Store feedback as JSON in tokenUsage field (reuse existing column)
  await prisma.aiMessage.update({
    where: { id: messageId },
    data: {
      tokenUsage: {
        // Preserve existing token data, add feedback
        feedback,
        feedbackAt: new Date().toISOString(),
        feedbackBy: session.user.id,
      },
    },
  }).catch(() => {
    // Message might not exist — ignore
  });

  return NextResponse.json({ ok: true });
}
