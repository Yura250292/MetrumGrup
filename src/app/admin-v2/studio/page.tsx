import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { STUDIO_FIRM_ID } from "@/lib/firm/scope";

export const dynamic = "force-dynamic";

/**
 * Окремий дашборд Metrum Studio.
 *
 * Поведінка:
 * - SUPER_ADMIN → редірект на /admin-v2?firm=metrum-studio (та сама сторінка з override)
 * - MANAGER з firmId=metrum-studio (керівник студії) → /admin-v2 (його дані вже scoped)
 * - Інші → /admin-v2 (без доступу до Studio scope)
 */
export default async function AdminV2StudioDashboard() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (session.user.role === "SUPER_ADMIN") {
    redirect(`/admin-v2?firm=${STUDIO_FIRM_ID}`);
  }

  if (session.user.firmId === STUDIO_FIRM_ID) {
    redirect("/admin-v2");
  }

  redirect("/admin-v2");
}
