import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { prisma } from "@/lib/prisma";
import { ForemanShell } from "./_components/foreman-shell";
import { ForemanHomeHero } from "./_components/foreman-home-hero";

export const dynamic = "force-dynamic";

export default async function ForemanHomePage() {
  const session = await auth();
  const userName = session?.user?.name?.split(" ")[0] ?? "Виконроб";
  const { firmId } = await resolveFirmScopeForRequest(session);

  const [pending, approved] = session?.user?.id
    ? await Promise.all([
        prisma.foremanReport.count({
          where: {
            createdById: session.user.id,
            status: "PENDING_APPROVAL",
            firmId: firmId ?? undefined,
          },
        }),
        prisma.foremanReport.count({
          where: {
            createdById: session.user.id,
            status: "APPROVED",
            firmId: firmId ?? undefined,
          },
        }),
      ])
    : [0, 0];

  return (
    <ForemanShell isRoot showLogout firmId={firmId}>
      <ForemanHomeHero firmId={firmId} userName={userName} pending={pending} approved={approved} />
    </ForemanShell>
  );
}
