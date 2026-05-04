import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// Старий маршрут «Користувачі». Розділ обʼєднано зі сторінкою співробітників:
// /admin-v2/hr/employees, де SUPER_ADMIN бачить таб «Зовнішні акаунти» — User-и
// без Employee профілю (CLIENT/USER). Зберігаємо для bookmarkів.
export const dynamic = "force-dynamic";

export default async function LegacyUsersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (session.user.role === "SUPER_ADMIN") {
    redirect("/admin-v2/hr/employees?tab=external");
  }
  redirect("/admin-v2/hr/employees");
}
