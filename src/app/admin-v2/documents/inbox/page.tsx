import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SUPPLIER_LEDGER_ROLES } from "@/lib/auth-utils";
import { InboxClient } from "./inbox-client";

export const dynamic = "force-dynamic";

export default async function DocumentsInboxPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin-v2/documents/inbox");
  if (!SUPPLIER_LEDGER_ROLES.includes(session.user.role)) {
    redirect("/admin-v2");
  }
  return <InboxClient />;
}
