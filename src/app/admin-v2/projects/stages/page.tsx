import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isHomeFirmFor } from "@/lib/firm/scope";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { CrossProjectStagesView } from "./_components/cross-project-stages-view";

export const dynamic = "force-dynamic";

export default async function CrossProjectStagesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) {
    redirect("/admin-v2");
  }

  const role = session.user.role;
  if (role !== "SUPER_ADMIN" && role !== "MANAGER") {
    redirect("/admin-v2/projects");
  }

  return <CrossProjectStagesView currentUserId={session.user.id ?? null} />;
}
