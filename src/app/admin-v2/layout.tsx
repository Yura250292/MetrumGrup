import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "./_components/sidebar";
import { Header } from "./_components/header";
import { MobileShell } from "./_components/mobile-shell";
import { TimerPill } from "./_components/timer-pill";
import { ThemeShell } from "./_components/theme-shell";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import "./admin-v2-dark.css";

export const dynamic = "force-dynamic";

export default async function AdminV2Layout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isClient = session.user.role === "CLIENT";

  return (
    <ThemeShell>
      <div className="min-h-screen transition-colors duration-300" style={{ backgroundColor: T.background, color: T.textPrimary }}>
        <Sidebar />
        <MobileShell />
        <div className="md:pl-[264px] flex flex-col min-h-screen">
          <Header />
          <main className="flex-1 px-6 py-6 md:px-8 md:py-8 pb-24 md:pb-8">{children}</main>
        </div>
        {!isClient && <TimerPill />}
      </div>
    </ThemeShell>
  );
}
