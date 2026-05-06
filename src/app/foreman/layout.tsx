import { redirect } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import "./foreman.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Метрум — Виконроб",
  description: "Звіти виконроба про витрати на об'єкті",
  // iOS PWA / Safari hints — мінімізує browser chrome, robить status bar
  // прозорим над dark контентом, дозволяє повноекранний "app-feel".
  appleWebApp: {
    capable: true,
    title: "Метрум",
    statusBarStyle: "black-translucent",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover", // simul. extending під notch/home-indicator
};

export default async function ForemanLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/foreman");
  }

  const { firmId } = await resolveFirmScopeForRequest(session);
  const activeRole = getActiveRoleFromSession(session, firmId);
  if (activeRole !== "FOREMAN") {
    if (session.user.role === "CLIENT") redirect("/dashboard");
    redirect("/admin-v2");
  }

  return <div className="foreman-root">{children}</div>;
}
