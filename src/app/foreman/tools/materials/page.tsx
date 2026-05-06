import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { ForemanShell } from "../../_components/foreman-shell";
import { MaterialsCalculator } from "./_calculator";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ floor?: string; walls?: string; ceiling?: string }>;
}

export default async function ForemanMaterialsToolPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const session = await auth();
  const { firmId } = await resolveFirmScopeForRequest(session);

  return (
    <ForemanShell title="Розрахунок матеріалів" backHref="/foreman" firmId={firmId}>
      <MaterialsCalculator
        prefilledFloor={sp.floor}
        prefilledWalls={sp.walls}
        prefilledCeiling={sp.ceiling}
      />
    </ForemanShell>
  );
}
