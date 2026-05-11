import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { canViewFinance } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

export default async function FinanceSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { firmId } = await resolveFirmScopeForRequest(session);
  const role = getActiveRoleFromSession(session, firmId);
  if (!canViewFinance(role)) redirect("/admin-v2");
  return <>{children}</>;
}
