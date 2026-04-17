import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/app/admin-v2/_components/sidebar";
import { Header } from "@/app/admin-v2/_components/header";
import { MobileShell } from "@/app/admin-v2/_components/mobile-shell";
import { ThemeShell } from "@/app/admin-v2/_components/theme-shell";
import { T } from "./_components/tokens";
import "@/app/admin-v2/admin-v2-dark.css";

export const dynamic = "force-dynamic";

export default async function AiEstimateV2Layout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <ThemeShell>
      <div className="min-h-screen transition-colors duration-300" style={{ backgroundColor: T.background, color: T.textPrimary }}>
        <Sidebar />
        <MobileShell />
        <div className="md:pl-[264px] flex flex-col min-h-screen">
          <Header />
          <main className="flex-1 pb-24 md:pb-8">{children}</main>
        </div>
      </div>
    </ThemeShell>
  );
}
