import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/app/admin-v2/_components/sidebar";
import { Header } from "@/app/admin-v2/_components/header";
import { MobileShell } from "@/app/admin-v2/_components/mobile-shell";
import { T } from "./_components/tokens";

export const dynamic = "force-dynamic";

export default async function AiEstimateV2Layout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="min-h-screen" style={{ backgroundColor: T.background, color: T.textPrimary }}>
      <Sidebar />
      <MobileShell />
      <div className="md:pl-[264px] flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 pb-24 md:pb-8">{children}</main>
      </div>
    </div>
  );
}
