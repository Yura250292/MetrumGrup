import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Package, Truck } from "lucide-react";
import { auth } from "@/lib/auth";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import {
  isHomeFirmFor,
  getActiveRoleFromSession,
} from "@/lib/firm/scope";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { GlobalMaterialsList } from "./_components/global-materials-list";
import { SuppliersCatalog } from "../suppliers/_components/suppliers-catalog";

export const dynamic = "force-dynamic";

type Tab = "catalog" | "suppliers";

/**
 * Об'єднана сторінка довідника матеріалів. Дві проєкції на один домен:
 *
 *   - "catalog"   — глобальний `Material` каталог (для кошторисів):
 *                   назва, sku, unit, basePrice, laborRate, markup.
 *                   Канонічна позиція що використовується у `EstimateItem`.
 *
 *   - "suppliers" — `SupplierMaterial` (фактичні ціни постачальників):
 *                   що саме купували у кого, за якою ціною, історія, тренди ▲▼.
 *                   Заповнюється автоматично на approve foreman-звіту.
 *
 * Зв'язок: `SupplierMaterial.materialId?` — опційний FK на `Material` коли
 * менеджер змаппив постачальницьку позицію на канонічну (Phase 4+).
 */
export default async function MaterialsCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) redirect("/admin-v2");

  const allowed = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];
  const role = getActiveRoleFromSession(session, firmId);
  if (!role || !allowed.includes(role)) redirect("/admin-v2");

  const sp = await searchParams;
  const tab: Tab = sp.tab === "suppliers" ? "suppliers" : "catalog";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link
          href="/admin-v2/catalogs"
          className="flex items-center gap-1.5 text-[12px] hover:underline"
          style={{ color: T.textSecondary }}
        >
          <ArrowLeft size={14} />
          До довідників
        </Link>
      </div>

      <header className="flex items-center gap-2">
        <Package size={18} style={{ color: T.accentPrimary }} />
        <h1
          className="text-[18px] font-bold tracking-tight"
          style={{ color: T.textPrimary }}
        >
          Матеріали та ціни
        </h1>
        <span className="text-[11px]" style={{ color: T.textMuted }}>
          — глобальний каталог + фактичні ціни постачальників
        </span>
      </header>

      <div className="flex items-center gap-1 flex-wrap">
        <TabLink href="/admin-v2/catalogs/materials" active={tab === "catalog"}>
          <Package size={13} className="inline mr-1" /> Каталог матеріалів
        </TabLink>
        <TabLink
          href="/admin-v2/catalogs/materials?tab=suppliers"
          active={tab === "suppliers"}
        >
          <Truck size={13} className="inline mr-1" /> Ціни від постачальників
        </TabLink>
      </div>

      {/* Існуючі client-компоненти переюзаємо без переписування логіки. */}
      {tab === "catalog" ? <GlobalMaterialsList /> : <SuppliersCatalog />}
    </div>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl px-3 py-1.5 text-[12px] font-semibold transition"
      style={{
        backgroundColor: active ? T.accentPrimary : T.panel,
        color: active ? "#fff" : T.textSecondary,
        border: `1px solid ${active ? T.accentPrimary : T.borderSoft}`,
      }}
    >
      {children}
    </Link>
  );
}
