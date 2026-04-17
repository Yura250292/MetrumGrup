import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { MeDashboard } from "./_components/me-dashboard";

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
    <div className="flex flex-col gap-6">
      <header>
        <span
          className="text-[11px] font-bold tracking-wider"
          style={{ color: T.textMuted }}
        >
          ОСОБИСТИЙ ДАШБОРД
        </span>
        <h1 className="text-2xl font-bold" style={{ color: T.textPrimary }}>
          Мої задачі
        </h1>
      </header>
      <MeDashboard currentUserId={session.user.id} />
    </div>
  );
}
