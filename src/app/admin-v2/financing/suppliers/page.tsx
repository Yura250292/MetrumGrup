import { redirect } from "next/navigation";
import Link from "next/link";
import { Truck, Wallet, FileSpreadsheet } from "lucide-react";
import { auth } from "@/lib/auth";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  isHomeFirmFor,
  getActiveRoleFromSession,
} from "@/lib/firm/scope";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { SuppliersLedger } from "./_components/suppliers-ledger";
import { SupplierPaymentsList } from "../supplier-payments/_components/supplier-payments-list";
import { ImportInvoicesClient } from "./_components/import-invoices-client";

export const dynamic = "force-dynamic";

type Tab = "list" | "payments" | "import";

const WRITE_ROLES = new Set(["SUPER_ADMIN", "MANAGER", "FINANCIER"]);

export default async function AdminSuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) redirect("/admin-v2");

  const allowed = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];
  const role = getActiveRoleFromSession(session, firmId);
  if (!role || !allowed.includes(role)) redirect("/admin-v2");

  const sp = await searchParams;
  const canImport = WRITE_ROLES.has(role);
  const requestedTab = sp.tab;
  const tab: Tab =
    requestedTab === "payments"
      ? "payments"
      : requestedTab === "import" && canImport
        ? "import"
        : "list";

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

      {/* Tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        <TabLink href="/admin-v2/financing/suppliers" active={tab === "list"}>
          <Truck size={13} className="inline mr-1" /> Список
        </TabLink>
        <TabLink
          href="/admin-v2/financing/suppliers?tab=payments"
          active={tab === "payments"}
        >
          <Wallet size={13} className="inline mr-1" /> Журнал платежів
        </TabLink>
        {canImport && (
          <TabLink
            href="/admin-v2/financing/suppliers?tab=import"
            active={tab === "import"}
          >
            <FileSpreadsheet size={13} className="inline mr-1" /> Імпорт з xlsx
          </TabLink>
        )}
      </div>

      {tab === "list" && <SuppliersLedger currentUserRole={role} />}
      {tab === "payments" && <SupplierPaymentsList currentUserRole={role} />}
      {tab === "import" && canImport && <ImportInvoicesClient />}
    </div>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl px-3 py-1.5 text-[12px] font-semibold transition"
      style={{
        backgroundColor: active ? T.accentPrimary : T.panel,
        color: active ? "#fff" : T.textSecondary,
        border: `1px solid ${active ? T.accentPrimary : T.borderSoft}`,
      }}
    >
      {children}
    </Link>
  );
}
