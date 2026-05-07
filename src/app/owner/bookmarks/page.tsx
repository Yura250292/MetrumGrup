import Link from "next/link";
import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { prisma } from "@/lib/prisma";
import { OwnerShell } from "../_components/owner-shell";
import { BookmarksList } from "./_list";

export const dynamic = "force-dynamic";

export default async function OwnerBookmarksPage() {
  const session = await auth();
  if (!session?.user) return null;
  const { firmId } = await resolveFirmScopeForRequest(session);

  // Усі повідомлення-закладки з усіх розмов власника
  const bookmarks = await prisma.ownerChatMessage.findMany({
    where: {
      isBookmarked: true,
      conversation: { userId: session.user.id },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      conversation: {
        select: { id: true, title: true },
      },
    },
  });

  return (
    <OwnerShell title="Закладки" backHref="/owner/chat" activeFirmId={firmId} wide>
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1 mt-1">
          <p className="text-xs text-zinc-500">
            {bookmarks.length} {bookmarks.length === 1 ? "збережене" : "збережених"}
            {" "}повідомлень
          </p>
          <Link
            href="/owner/chat"
            className="text-[11px] text-zinc-400 hover:text-white transition"
          >
            ← До чату
          </Link>
        </div>

        <BookmarksList
          items={bookmarks.map((b) => ({
            id: b.id,
            content: b.content,
            createdAt: b.createdAt.toISOString(),
            conversationId: b.conversationId,
            conversationTitle: b.conversation.title,
          }))}
        />
      </div>
    </OwnerShell>
  );
}
