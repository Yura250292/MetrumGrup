import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { CounterpartyList } from "./_components/counterparty-list";

export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER", "HR"];

export default async function CounterpartiesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!ALLOWED.includes(session.user.role)) redirect("/admin-v2");

  return <CounterpartyList currentUserRole={session.user.role} />;
}
