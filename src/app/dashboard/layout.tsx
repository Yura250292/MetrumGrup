import { ClientSidebar } from "@/components/layout/ClientSidebar";
import { BottomNavigation } from "@/components/layout/BottomNavigation";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0F0F0F]">
      <ClientSidebar />
      <BottomNavigation />
      <main className="md:pl-[260px]">
        <div className="mx-auto max-w-5xl px-4 py-6 pb-24 md:px-8 md:py-8 md:pb-8">
          {children}
        </div>
      </main>
    </div>
  );
}
