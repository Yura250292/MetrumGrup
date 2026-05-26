import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { MeDashboard } from "./_components/me-dashboard";
import { SectionTabs } from "../_components/section-tabs";

const TASK_TABS = [
  { href: "/admin-v2/me", label: "Мої задачі", exact: true },
  { href: "/admin-v2/team", label: "Усі задачі (команда)" },
];

export const dynamic = "force-dynamic";

export default async function MyTasksPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (session.user.role === "CLIENT") {
    return (
      <div
        className="rounded-2xl p-6 text-center text-sm"
        style={{
          backgroundColor: T.panel,
          border: `1px solid ${T.borderSoft}`,
          color: T.textMuted,
        }}
      >
        Задачі — внутрішній інструмент команди.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionTabs tabs={TASK_TABS} />
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h1 className="text-xl font-bold" style={{ color: T.textPrimary }}>
          Моя робота
        </h1>
        <p
          className="text-[12px] w-full sm:w-auto"
          style={{ color: T.textSecondary }}
        >
          Що потрібно зробити, що очікує рішення і що блокує команду
        </p>
      </header>
      <MeDashboard
        currentUserId={session.user.id}
        currentUserRole={session.user.role}
      />
    </div>
  );
}
