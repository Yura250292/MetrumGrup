import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { ForemanShell } from "../../_components/foreman-shell";
import { LevelTool } from "./_tool";

export const dynamic = "force-dynamic";

export default async function ForemanLevelToolPage() {
  const session = await auth();
  const { firmId } = await resolveFirmScopeForRequest(session);

  return (
    <ForemanShell title="Лінійка та рівень" backHref="/foreman" firmId={firmId}>
      <LevelTool />
    </ForemanShell>
  );
}
