import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SharedConversationView } from "./_view";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function SharedConversationPage({ params }: PageProps) {
  const { token } = await params;

  const conversation = await prisma.ownerConversation.findFirst({
    where: { shareToken: token },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      user: { select: { name: true } },
    },
  });

  if (!conversation) notFound();

  return (
    <SharedConversationView
      title={conversation.title}
      author={conversation.user.name}
      sharedAt={conversation.shareTokenAt?.toISOString() ?? conversation.updatedAt.toISOString()}
      messages={conversation.messages.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      }))}
    />
  );
}
