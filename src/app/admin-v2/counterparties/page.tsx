import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { CounterpartyList } from "./_components/counterparty-list";
import { SectionTabs } from "../_components/section-tabs";
import { PageIntroCard } from "../_components/help/PageIntroCard";

export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER", "HR"];

const PARTNERS_TABS = [
  { href: "/admin-v2/counterparties", label: "Контрагенти", exact: true },
  { href: "/admin-v2/clients", label: "Клієнти" },
];

export default async function CounterpartiesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!ALLOWED.includes(session.user.role)) redirect("/admin-v2");

  return (
    <div className="flex flex-col gap-4">
      <PageIntroCard />
      <SectionTabs tabs={PARTNERS_TABS} />
      <CounterpartyList currentUserRole={session.user.role} />
    </div>
  );
}
