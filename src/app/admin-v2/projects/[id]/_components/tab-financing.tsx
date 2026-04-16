"use client";

import { useSession } from "next-auth/react";
import { FinancingView } from "@/app/admin-v2/financing/_components/financing-view";

export function TabFinancing({
  projectId,
  projectTitle,
}: {
  projectId: string;
  projectTitle: string;
}) {
  const { data: session } = useSession();

  return (
    <FinancingView
      scope={{ id: projectId, title: projectTitle }}
      projects={[]}
      currentUserId={session?.user?.id ?? ""}
      currentUserName={session?.user?.name ?? session?.user?.email ?? "Ви"}
    />
  );
}
