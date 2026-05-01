import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { EmployeesList } from "./_components/employees-list";

export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "MANAGER", "HR"];

export default async function HrEmployeesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!ALLOWED.includes(session.user.role)) redirect("/admin-v2");

  return <EmployeesList currentUserRole={session.user.role} />;
}
