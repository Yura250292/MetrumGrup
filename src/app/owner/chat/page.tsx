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

  // Завантажити список розмов для sidebar
  const conversations = session?.user
    ? await prisma.ownerConversation.findMany({
        where: { userId: session.user.id },
        orderBy: { updatedAt: "desc" },
        take: 50,
        select: { id: true, title: true, messageCount: true, updatedAt: true },
      })
    : [];

  // Якщо немає ?c у URL і немає ?new=1 — редиректимо у найновішу розмову
  // (якщо є хоча б одна). Тоді власник продовжує там де зупинився.
  if (!sp.c && !sp.new && conversations.length > 0) {
    redirect(`/owner/chat?c=${conversations[0].id}`);
  }

  // Якщо обрано конкретну conversation — підвантажуємо її messages
  let initialConversation: {
    id: string;
    title: string;
    messages: Array<{
      id: string;
      role: "user" | "assistant";
      content: string;
      toolCallsJson: unknown;
      createdAt: string;
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
        messages: conv.messages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          toolCallsJson: m.toolCallsJson,
          createdAt: m.createdAt.toISOString(),
        })),
      };
    }
  }

  return (
    <OwnerShell title="AI асистент" backHref="/owner" activeFirmId={firmId} wide>
      <OwnerChat
        // Force remount при зміні conversation — щоб state messages оновлювалось
        key={initialConversation?.id ?? "new"}
        conversations={conversations.map((c) => ({
          id: c.id,
          title: c.title,
          messageCount: c.messageCount,
          updatedAt: c.updatedAt.toISOString(),
        }))}
        initialConversation={initialConversation}
      />
    </OwnerShell>
  );
}
