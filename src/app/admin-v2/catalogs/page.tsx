import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Library, Package } from "lucide-react";
import { auth } from "@/lib/auth";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  isHomeFirmFor,
  getActiveRoleFromSession,
} from "@/lib/firm/scope";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";

export const dynamic = "force-dynamic";

type CatalogCard = {
  href: string;
  title: string;
  desc: string;
  icon: typeof Package;
  available: boolean;
};

const CATALOGS: CatalogCard[] = [
  {
    href: "/admin-v2/catalogs/materials",
    title: "Матеріали та ціни",
    desc: "Глобальний каталог для кошторисів + фактичні ціни постачальників з історією і трендами ▲▼.",
    icon: Package,
    available: true,
  },
  // Майбутні довідники додавати сюди — keep array short, без зайвих рендерів.
];

export default async function CatalogsLandingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) redirect("/admin-v2");

  const allowed = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];
  const role = getActiveRoleFromSession(session, firmId);
  if (!role || !allowed.includes(role)) redirect("/admin-v2");

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <Library size={18} style={{ color: T.accentPrimary }} />
        <h1
          className="text-[18px] font-bold tracking-tight"
          style={{ color: T.textPrimary }}
        >
          Довідники
        </h1>
        <span className="text-[11px]" style={{ color: T.textMuted }}>
          — переглядайте та управляйте даними організації
        </span>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CATALOGS.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.href}
              href={c.available ? c.href : "#"}
              className="rounded-2xl p-4 flex flex-col gap-2 transition hover:brightness-[0.97]"
              style={{
                backgroundColor: T.panel,
                border: `1px solid ${T.borderStrong}`,
                opacity: c.available ? 1 : 0.55,
                pointerEvents: c.available ? undefined : "none",
              }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{
                    backgroundColor: T.accentPrimarySoft,
                    color: T.accentPrimary,
                  }}
                >
                  <Icon size={16} />
                </div>
                <span
                  className="text-[14px] font-bold"
                  style={{ color: T.textPrimary }}
                >
                  {c.title}
                </span>
                <ArrowRight
                  size={14}
                  style={{ color: T.textMuted, marginLeft: "auto" }}
                />
              </div>
              <p
                className="text-[12px] leading-relaxed"
                style={{ color: T.textSecondary }}
              >
                {c.desc}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
