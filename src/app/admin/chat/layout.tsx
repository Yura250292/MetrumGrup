import { redirect } from "next/navigation";
import { requireStaffAccess } from "@/lib/auth-utils";

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireStaffAccess();
  } catch {
    redirect("/admin");
  }
  return <>{children}</>;
}
