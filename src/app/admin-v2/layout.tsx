import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "./_components/sidebar";
import { Header } from "./_components/header";
import { MobileShell } from "./_components/mobile-shell";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export const dynamic = "force-dynamic";

export default async function AdminV2Layout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="min-h-screen" style={{ backgroundColor: T.background, color: T.textPrimary }}>
      <Sidebar />
      <MobileShell />
      <div className="md:pl-[264px] flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 px-6 py-6 md:px-8 md:py-8 pb-24 md:pb-8">{children}</main>
      </div>
    </div>
  );
}
