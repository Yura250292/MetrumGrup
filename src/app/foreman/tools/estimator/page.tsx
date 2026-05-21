import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { ForemanShell } from "../../_components/foreman-shell";
import { Estimator } from "./_estimator";

export const dynamic = "force-dynamic";

export default async function ForemanEstimatorPage() {
  const session = await auth();
  const { firmId } = await resolveFirmScopeForRequest(session);

  return (
    <ForemanShell title="Кошторис" backHref="/foreman" firmId={firmId}>
      <Estimator firmId={firmId} />
    </ForemanShell>
  );
}
