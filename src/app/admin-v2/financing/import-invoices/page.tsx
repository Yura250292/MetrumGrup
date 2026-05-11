import { redirect } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";
import { auth } from "@/lib/auth";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  isHomeFirmFor,
  getActiveRoleFromSession,
} from "@/lib/firm/scope";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { ImportInvoicesClient } from "./_components/import-invoices-client";

export const dynamic = "force-dynamic";

export default async function ImportInvoicesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) redirect("/admin-v2");

  const role = getActiveRoleFromSession(session, firmId);
  const allowed = ["SUPER_ADMIN", "MANAGER", "FINANCIER"];
  if (!role || !allowed.includes(role)) redirect("/admin-v2");

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <FileSpreadsheet size={18} style={{ color: T.accentPrimary }} />
        <h1
          className="text-[18px] font-bold tracking-tight"
          style={{ color: T.textPrimary }}
        >
          Імпорт рахунків (xlsx)
        </h1>
        <span className="text-[11px]" style={{ color: T.textMuted }}>
          — кошторисницький ledger постачальників і боргів
        </span>
      </header>

      <ImportInvoicesClient />
    </div>
  );
}
