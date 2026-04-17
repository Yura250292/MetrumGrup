import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Calculator } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { ReferenceEstimatesClient } from "./_components/reference-estimates-client";

export const dynamic = "force-dynamic";

export default async function AdminV2ReferenceEstimatesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const allowedRoles = ["SUPER_ADMIN", "MANAGER", "ENGINEER", "FINANCIER"];
  if (!allowedRoles.includes(session.user.role)) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span
            className="text-[11px] font-bold tracking-wider"
            style={{ color: T.textMuted }}
          >
            ШАБЛОНИ ДЛЯ КАЛЬКУЛЯТОРА
          </span>
          <h1
            className="text-3xl md:text-4xl font-bold tracking-tight"
            style={{ color: T.textPrimary }}
          >
            Довідкові кошториси
          </h1>
          <p className="text-[15px]" style={{ color: T.textSecondary }}>
            Готові кошториси, які слугують еталоном для калькулятора в проектах.
            Калькулятор лінійно масштабує позиції за площею.
          </p>
        </div>
        <div
          className="flex items-center gap-2 rounded-xl px-4 py-3"
          style={{
            backgroundColor: T.panelElevated,
            border: `1px solid ${T.borderSoft}`,
            color: T.textSecondary,
          }}
        >
          <Calculator size={16} style={{ color: T.accentPrimary }} />
          <span className="text-xs">XLSX → еталон → калькулятор</span>
        </div>
      </section>

      <ReferenceEstimatesClient />
    </div>
  );
}
