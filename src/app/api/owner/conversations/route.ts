import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  let session, firmId;
  try {
    ({ session, firmId } = await requireOwner());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }
  void firmId;

  const conversations = await prisma.ownerConversation.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      messageCount: true,
      firmId: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ conversations });
}

const CreateBody = z.object({
  title: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  let session, firmId;
  try {
    ({ session, firmId } = await requireOwner());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }

  const body = await req.json().catch(() => ({}));
  const parsed = CreateBody.safeParse(body);
  const title = parsed.success ? parsed.data.title?.trim() : undefined;

  const created = await prisma.ownerConversation.create({
    data: {
      userId: session.user.id,
      firmId: firmId ?? null,
      title: title || "Нова розмова",
    },
    select: { id: true, title: true, createdAt: true },
  });

  return NextResponse.json({ conversation: created });
}
