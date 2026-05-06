import { redirect } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import "./owner.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Метрум — Дашборд директора",
  description: "Аналітика проектів та фінансів",
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

export async function generateViewport(): Promise<Viewport> {
  const session = await auth();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const themeColor =
    firmId === "metrum-studio"
      ? "#1a0f04"
      : firmId === "metrum-group"
        ? "#0a0f25"
        : "#09090b";
  return {
    themeColor,
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: "cover",
  };
}

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/owner");
  }

  const { firmId } = await resolveFirmScopeForRequest(session);
  const activeRole = getActiveRoleFromSession(session, firmId);
  if (activeRole !== "OWNER" && activeRole !== "SUPER_ADMIN") {
    if (session.user.role === "CLIENT") redirect("/dashboard");
    if (session.user.role === "FOREMAN") redirect("/foreman");
    redirect("/admin-v2");
  }

  return <div className="owner-root">{children}</div>;
}
