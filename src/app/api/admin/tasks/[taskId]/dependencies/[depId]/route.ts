import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getProjectAccessContext } from "@/lib/projects/access";
import { removeDependency } from "@/lib/tasks/dependencies";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string; depId: string }> },
) {
  const { taskId, depId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  const dep = await prisma.taskDependency.findUnique({
    where: { id: depId },
    include: {
      predecessor: { select: { projectId: true } },
    },
  });
  if (!dep) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Ensure the caller is modifying a dep on the referenced task
  if (dep.predecessorId !== taskId && dep.successorId !== taskId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const ctx = await getProjectAccessContext(dep.predecessor.projectId, session.user.id);
  if (!ctx?.canEditAnyTask) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await removeDependency(depId);
  return NextResponse.json({ ok: true });
}
