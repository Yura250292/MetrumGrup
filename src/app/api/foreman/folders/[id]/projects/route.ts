import { NextResponse } from "next/server";
import { requireForeman, getForemanProjects, forbiddenResponse, unauthorizedResponse } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  let session, firmId;
  try {
    ({ session, firmId } = await requireForeman());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") return forbiddenResponse();
    return unauthorizedResponse();
  }

  const all = await getForemanProjects(session.user.id, firmId);
  const projects = id === "none" ? all.filter((p) => !p.folderId) : all.filter((p) => p.folderId === id);

  return NextResponse.json({
    projects: projects.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      address: p.address,
    })),
  });
}
