import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { auth } from "@/lib/auth";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  isHomeFirmFor,
  getActiveRoleFromSession,
} from "@/lib/firm/scope";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { SupplierPaymentsList } from "./_components/supplier-payments-list";

export const dynamic = "force-dynamic";

export default async function AdminSupplierPaymentsPage() {
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
        <Wallet size={18} style={{ color: T.accentPrimary }} />
        <h1
          className="text-[18px] font-bold tracking-tight"
          style={{ color: T.textPrimary }}
        >
          Платежі постачальникам
        </h1>
        <span className="text-[11px]" style={{ color: T.textMuted }}>
          — журнал з фільтрами та керуванням розподілом
        </span>
      </header>
      <SupplierPaymentsList currentUserRole={role} />
    </div>
  );
}
