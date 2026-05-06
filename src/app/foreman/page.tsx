import Link from "next/link";
import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { prisma } from "@/lib/prisma";
import { ForemanShell } from "./_components/foreman-shell";
import { BigButton } from "./_components/big-button";

export const dynamic = "force-dynamic";

export default async function ForemanHomePage() {
  const session = await auth();
  const userName = session?.user?.name?.split(" ")[0] ?? "Виконроб";
  const { firmId } = await resolveFirmScopeForRequest(session);

  const pending = session?.user?.id
    ? await prisma.foremanReport.count({
        where: {
          createdById: session.user.id,
          status: "PENDING_APPROVAL",
          firmId: firmId ?? undefined,
        },
      })
    : 0;

  return (
    <ForemanShell title={`Привіт, ${userName}`} showLogout>
      <div className="flex flex-col gap-4 mt-4">
        <Link href="/foreman/report/folder" className="block">
          <BigButton size="huge" type="button">
            <span className="text-3xl mr-2">📋</span>
            Звіт
          </BigButton>
        </Link>

        <Link href="/foreman/history" className="block">
          <BigButton variant="secondary" type="button">
            <span className="text-2xl mr-2">🗂️</span>
            Історія звітів
            {pending > 0 && (
              <span className="ml-auto bg-amber-500 text-zinc-900 rounded-full px-3 py-1 text-sm font-bold">
                {pending}
              </span>
            )}
          </BigButton>
        </Link>
      </div>

      <div className="mt-8 rounded-2xl bg-zinc-900/60 border border-zinc-800 p-4 text-sm text-zinc-400 leading-relaxed">
        <div className="font-semibold text-zinc-200 mb-1">Як зробити звіт</div>
        <ol className="list-decimal list-inside space-y-1">
          <li>Натисніть «Звіт»</li>
          <li>Оберіть папку (об{"’"}єкт)</li>
          <li>Оберіть квартиру</li>
          <li>Опишіть витрати або сфотографуйте накладну</li>
          <li>Перевірте розпізнане → «Підтвердити»</li>
        </ol>
      </div>
    </ForemanShell>
  );
}
