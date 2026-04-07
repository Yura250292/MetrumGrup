"use client";

import { ClientSidebar } from "@/components/layout/ClientSidebar";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { ThemeProvider } from "@/contexts/ThemeContext";
import "@/app/admin/admin-dark-theme.css";
import "@/app/admin/admin-light-theme.css";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <div className="min-h-screen transition-colors duration-300 admin-dark:bg-[#0F0F0F] admin-light:bg-gray-50">
        <ClientSidebar />
        <BottomNavigation />
        <main className="md:pl-[260px]">
          <div className="mx-auto max-w-5xl px-4 py-6 pb-24 md:px-8 md:py-8 md:pb-8">
            {children}
          </div>
        </main>
      </div>
    </ThemeProvider>
  );
}
