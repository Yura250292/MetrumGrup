import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Settings, Lock } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export const dynamic = "force-dynamic";

export default async function AdminV2SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const settings = await prisma.setting.findMany();
  const settingsMap = Object.fromEntries(
    settings.map((s) => [s.id, typeof s.value === "string" ? s.value : JSON.stringify(s.value)])
  );

  const fields = [
    { key: "company_name", label: "Назва компанії" },
    { key: "company_phone", label: "Телефон" },
    { key: "company_email", label: "Email" },
    { key: "overhead_rate", label: "Ставка накладних витрат (%)" },
  ];

  return (
    <div className="flex flex-col gap-8 max-w-3xl">
      {/* Hero */}
      <section className="flex flex-col gap-2">
        <span className="text-[11px] font-bold tracking-wider" style={{ color: T.textMuted }}>
          СИСТЕМА
        </span>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
          Налаштування
        </h1>
        <p className="text-[15px]" style={{ color: T.textSecondary }}>
          Базові параметри системи та компанії
        </p>
      </section>

      {/* Card */}
      <section
        className="flex flex-col gap-5 rounded-2xl p-6"
        style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: T.accentPrimarySoft }}
          >
            <Settings size={20} style={{ color: T.accentPrimary }} />
          </div>
          <div className="flex flex-col gap-0">
            <span className="text-sm font-bold" style={{ color: T.textPrimary }}>
              Дані компанії
            </span>
            <span className="text-[11px]" style={{ color: T.textMuted }}>
              Базові налаштування системи
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {fields.map((field) => (
            <div key={field.key} className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
                {field.label.toUpperCase()}
              </label>
              <input
                defaultValue={settingsMap[field.key]?.replace(/"/g, "") || ""}
                readOnly
                className="rounded-xl px-4 py-3 text-sm outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              />
            </div>
          ))}
        </div>

        <div
          className="flex items-start gap-2.5 rounded-xl p-3.5"
          style={{ backgroundColor: T.warningSoft, border: `1px solid ${T.warning}` }}
        >
          <Lock size={14} style={{ color: T.warning }} className="mt-0.5 flex-shrink-0" />
          <div className="flex flex-col gap-0.5">
            <span className="text-[12px] font-semibold" style={{ color: T.warning }}>
              Тільки перегляд
            </span>
            <span className="text-[11px]" style={{ color: T.textMuted }}>
              Редагування налаштувань буде доступно в наступній версії
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
