import { redirect } from "next/navigation";
import { Truck } from "lucide-react";
import { auth } from "@/lib/auth";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  isHomeFirmFor,
  getActiveRoleFromSession,
} from "@/lib/firm/scope";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { SuppliersLedger } from "./_components/suppliers-ledger";

export const dynamic = "force-dynamic";

export default async function AdminSuppliersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) redirect("/admin-v2");

  const allowed = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];
  const role = getActiveRoleFromSession(session, firmId);
  if (!role || !allowed.includes(role)) redirect("/admin-v2");

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <Truck size={18} style={{ color: T.accentPrimary }} />
        <h1
          className="text-[18px] font-bold tracking-tight"
          style={{ color: T.textPrimary }}
        >
          Постачальники
        </h1>
        <span className="text-[11px]" style={{ color: T.textMuted }}>
          — борги, платежі, ціни матеріалів
        </span>
      </header>
      <SuppliersLedger currentUserRole={role} />
    </div>
  );
}
