import { redirect } from "next/navigation";
import type { Viewport } from "next";
import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getFirmBrand } from "@/lib/firm/scope";
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
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { MotionProvider } from "@/components/motion";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import "./admin-v2-dark.css";
import "@/styles/premium.css";

export const dynamic = "force-dynamic";

/** Динамічний PWA theme-color: статус-бар на телефоні підлаштовується під активну фірму. */
export async function generateViewport(): Promise<Viewport> {
  const session = await auth();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const brand = getFirmBrand(firmId);
  return {
    themeColor: brand.pwaThemeColor,
  };
}

export default async function AdminV2Layout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isClient = session.user.role === "CLIENT";
  const { firmId: activeFirmId } = await resolveFirmScopeForRequest(session);

  return (
    <ThemeShell>
      <MotionProvider>
      <AiPanelProvider>
        <UserProfileProvider>
          <MeetingRecordingProvider>
            <SqueezeWrapper>
              <div className="min-h-screen transition-colors duration-300" style={{ backgroundColor: T.background, color: T.textPrimary }}>
                <Sidebar activeFirmId={activeFirmId} />
                <MobileShell />
                <div className="flex flex-col min-h-screen sidebar-push">
                  <Header />
                  <main className="flex-1 px-4 py-4 sm:px-6 sm:py-6 md:px-8 md:py-8 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8">
                    <PageTransition>{children}</PageTransition>
                  </main>
                </div>
                {!isClient && <TimerPill />}
                <MeetingMiniRecorder />
                <InstallPrompt />
              </div>
            </SqueezeWrapper>
            <AiPanelPortal />
          </MeetingRecordingProvider>
        </UserProfileProvider>
      </AiPanelProvider>
      </MotionProvider>
    </ThemeShell>
  );
}
