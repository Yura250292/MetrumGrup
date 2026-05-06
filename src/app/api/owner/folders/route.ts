import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  let session;
  try {
    ({ session } = await requireOwner());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }

  const folders = await prisma.ownerChatFolder.findMany({
    where: { userId: session.user.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { conversations: true } } },
  });

  return NextResponse.json({
    folders: folders.map((f) => ({
      id: f.id,
      name: f.name,
      color: f.color,
      sortOrder: f.sortOrder,
      conversationCount: f._count.conversations,
    })),
  });
}

const CreateBody = z.object({
  name: z.string().min(1).max(100),
  color: z.string().max(20).optional(),
});

export async function POST(req: NextRequest) {
  let session;
  try {
    ({ session } = await requireOwner());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }

  const body = await req.json().catch(() => ({}));
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const last = await prisma.ownerChatFolder.findFirst({
    where: { userId: session.user.id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const folder = await prisma.ownerChatFolder.create({
    data: {
      userId: session.user.id,
      name: parsed.data.name.trim(),
      color: parsed.data.color ?? null,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });

  return NextResponse.json({ folder });
}
