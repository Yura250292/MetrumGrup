import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import { getForemanProjects } from "@/lib/auth-utils";
import { LightShell } from "../../_components/v2/light-shell";
import { VoiceRecorder } from "./_recorder";

export const dynamic = "force-dynamic";

export default async function ForemanVoicePage() {
  const session = await auth();
  const { firmId } = await resolveFirmScopeForRequest(session);
  const userId = session!.user.id;
  const projects = await getForemanProjects(userId, firmId);

  return (
    <LightShell title="Голосовий звіт" backHref="/foreman" hideBottomNav>
      <VoiceRecorder
        projects={projects.map((p) => ({ id: p.id, title: p.title }))}
      />
    </LightShell>
  );
}
