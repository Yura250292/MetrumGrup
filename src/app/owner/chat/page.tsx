import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { OwnerShell } from "../_components/owner-shell";
import { OwnerChat } from "./_chat";

export const dynamic = "force-dynamic";

export default async function OwnerChatPage() {
  const session = await auth();
  const { firmId } = await resolveFirmScopeForRequest(session);

  return (
    <OwnerShell title="AI асистент" backHref="/owner" activeFirmId={firmId} wide>
      <OwnerChat />
    </OwnerShell>
  );
}
