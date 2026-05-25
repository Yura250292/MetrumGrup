import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { SUPPLIER_LEDGER_ROLES } from "@/lib/auth-utils";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { DocumentDetailClient } from "./document-detail-client";

export const dynamic = "force-dynamic";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!SUPPLIER_LEDGER_ROLES.includes(session.user.role)) redirect("/admin-v2");

  const { id } = await params;

  return (
    <div className="flex h-full flex-col">
      <header
        className="flex items-center gap-2 border-b px-4 py-3"
        style={{ borderColor: T.borderSoft, backgroundColor: T.panel }}
      >
        <Link
          href="/admin-v2/documents/inbox"
          className="inline-flex items-center gap-1 text-sm font-semibold"
          style={{ color: T.textSecondary }}
        >
          <ChevronLeft size={16} />
          До inbox
        </Link>
      </header>
      <div className="flex-1 overflow-hidden">
        <DocumentDetailClient documentId={id} canLink={session.user.role === "SUPER_ADMIN"} />
      </div>
    </div>
  );
}
