import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { ForemanShell } from "../../_components/foreman-shell";
import { AreaCalculator } from "./_calculator";

export const dynamic = "force-dynamic";

export default async function ForemanAreaToolPage() {
  const session = await auth();
  const { firmId } = await resolveFirmScopeForRequest(session);

  return (
    <ForemanShell title="Калькулятор площі" backHref="/foreman" firmId={firmId}>
      <AreaCalculator />
    </ForemanShell>
  );
}
