import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { prisma } from "@/lib/prisma";
import { OwnerShell } from "../_components/owner-shell";
import { OwnerChat } from "./_chat";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ c?: string; new?: string }>;
}

export default async function OwnerChatPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const session = await auth();
  const { firmId } = await resolveFirmScopeForRequest(session);

  // Завантажити список розмов + теки для sidebar
  const [conversations, folders] = session?.user
    ? await Promise.all([
        prisma.ownerConversation.findMany({
          where: { userId: session.user.id },
          orderBy: [
            { isPinned: "desc" },
            { pinnedAt: "desc" },
            { updatedAt: "desc" },
          ],
          take: 100,
          select: {
            id: true,
            title: true,
            messageCount: true,
            updatedAt: true,
            isPinned: true,
            folderId: true,
            shareToken: true,
          },
        }),
        prisma.ownerChatFolder.findMany({
          where: { userId: session.user.id },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          include: { _count: { select: { conversations: true } } },
        }),
      ])
    : [[], []];

  if (!sp.c && !sp.new && conversations.length > 0) {
    redirect(`/owner/chat?c=${conversations[0].id}`);
  }

  let initialConversation: {
    id: string;
    title: string;
    shareToken: string | null;
    messages: Array<{
      id: string;
      role: "user" | "assistant";
      content: string;
      toolCallsJson: unknown;
      createdAt: string;
      isBookmarked: boolean;
    }>;
  } | null = null;

  if (sp.c && session?.user) {
    const conv = await prisma.ownerConversation.findFirst({
      where: { id: sp.c, userId: session.user.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (conv) {
      initialConversation = {
        id: conv.id,
        title: conv.title,
        shareToken: conv.shareToken,
        messages: conv.messages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          toolCallsJson: m.toolCallsJson,
          createdAt: m.createdAt.toISOString(),
          isBookmarked: m.isBookmarked,
        })),
      };
    }
  }

  return (
    <OwnerShell title="AI асистент" backHref="/owner" activeFirmId={firmId} wide lockHeight>
      <OwnerChat
        key={initialConversation?.id ?? "new"}
        conversations={conversations.map((c) => ({
          id: c.id,
          title: c.title,
          messageCount: c.messageCount,
          updatedAt: c.updatedAt.toISOString(),
          isPinned: c.isPinned,
          folderId: c.folderId,
          shareToken: c.shareToken,
        }))}
        folders={folders.map((f) => ({
          id: f.id,
          name: f.name,
          color: f.color,
          conversationCount: f._count.conversations,
        }))}
        initialConversation={initialConversation}
      />
    </OwnerShell>
  );
}
