import { redirect } from "next/navigation";
import { requireStaffAccess } from "@/lib/auth-utils";

export default async function AdminV2ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireStaffAccess();
  } catch {
    redirect("/admin-v2");
  }
  return <>{children}</>;
}
