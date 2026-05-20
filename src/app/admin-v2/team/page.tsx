import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { TeamView } from "./_components/team-view";

export const dynamic = "force-dynamic";

/**
 * «Команда» — cross-project огляд активних задач, згрупований по виконавцях.
 * Виокремлено з /admin-v2/me (там був view "Люди") — концептуально це
 * team-overview, не «мої задачі», тому окрема сторінка.
 */
export default async function TeamPage() {
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
        Команда — внутрішній інструмент.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h1 className="text-xl font-bold" style={{ color: T.textPrimary }}>
          Команда
        </h1>
        <p
          className="text-[12px] w-full sm:w-auto"
          style={{ color: T.textSecondary }}
        >
          Хто на чому зосереджений і де ризики
        </p>
      </header>
      <TeamView />
    </div>
  );
}
