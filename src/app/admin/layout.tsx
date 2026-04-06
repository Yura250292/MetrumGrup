import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { AdminMobileNav } from "@/components/layout/AdminMobileNav";
import "./admin-dark-theme.css";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="admin-dark min-h-screen bg-[#0F0F0F]">
      <AdminSidebar />
      <AdminMobileNav />
      <div className="md:pl-64 transition-all duration-300">
        <AdminHeader />
        <main className="p-4 md:p-6 pb-20 md:pb-6">{children}</main>
      </div>
    </div>
  );
}
