import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "./_components/sidebar";
import { Header } from "./_components/header";
import { MobileShell } from "./_components/mobile-shell";
import { TimerPill } from "./_components/timer-pill";
import { ThemeShell } from "./_components/theme-shell";
import { AiPanelProvider } from "@/contexts/AiPanelContext";
import { AiPanelPortal } from "@/components/ai-assistant/AiPanelPortal";
import { SqueezeWrapper } from "@/components/ai-assistant/SqueezeWrapper";
import { UserProfileProvider } from "@/contexts/UserProfileContext";
import { MeetingRecordingProvider } from "@/contexts/MeetingRecordingContext";
import { MeetingMiniRecorder } from "./_components/meeting-mini-recorder";
import { PageTransition } from "./_components/page-transition";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import "./admin-v2-dark.css";

export const dynamic = "force-dynamic";

export default async function AdminV2Layout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isClient = session.user.role === "CLIENT";

  return (
    <ThemeShell>
      <AiPanelProvider>
        <UserProfileProvider>
          <MeetingRecordingProvider>
            <SqueezeWrapper>
              <div className="min-h-screen transition-colors duration-300" style={{ backgroundColor: T.background, color: T.textPrimary }}>
                <Sidebar />
                <MobileShell />
                <div className="flex flex-col min-h-screen sidebar-push">
                  <Header />
                  <main className="flex-1 px-4 py-4 sm:px-6 sm:py-6 md:px-8 md:py-8 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8">
                    <PageTransition>{children}</PageTransition>
                  </main>
                </div>
                {!isClient && <TimerPill />}
                <MeetingMiniRecorder />
              </div>
            </SqueezeWrapper>
            <AiPanelPortal />
          </MeetingRecordingProvider>
        </UserProfileProvider>
      </AiPanelProvider>
    </ThemeShell>
  );
}
