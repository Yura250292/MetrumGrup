import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { EmployeesList } from "./_components/employees-list";
import { SectionTabs } from "../../_components/section-tabs";

export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "MANAGER", "HR"];

export const PERSONNEL_TABS = [
  { href: "/admin-v2/hr/employees", label: "Співробітники", exact: true },
  { href: "/admin-v2/hr/subcontractors", label: "Підрядники" },
  { href: "/admin-v2/resources/workers", label: "Бригади та робітники" },
];

export default async function HrEmployeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!ALLOWED.includes(session.user.role)) redirect("/admin-v2");

  const sp = await searchParams;
  const tabParam = typeof sp.tab === "string" ? sp.tab : undefined;
  const initialTab = tabParam === "external" ? "external" : "employees";

  return (
    <div className="flex flex-col gap-4">
      <SectionTabs tabs={PERSONNEL_TABS} />
      <EmployeesList
        currentUserRole={session.user.role}
        initialTab={initialTab}
      />
    </div>
  );
}
