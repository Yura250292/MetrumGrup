import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { AdminMobileNav } from "@/components/layout/AdminMobileNav";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-muted/30">
      <AdminSidebar />
      <AdminMobileNav />
      <div className="md:pl-64 transition-all duration-300">
        <AdminHeader />
        <main className="p-4 md:p-6 pb-20 md:pb-6">{children}</main>
      </div>
    </div>
  );
}
