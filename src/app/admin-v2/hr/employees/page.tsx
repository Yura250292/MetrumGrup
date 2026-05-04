import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { EmployeesList } from "./_components/employees-list";

export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "MANAGER", "HR"];

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
    <EmployeesList
      currentUserRole={session.user.role}
      initialTab={initialTab}
    />
  );
}
