import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { searchTasks, TaskError } from "@/lib/tasks/service";
import type { FilterSpec, SortSpec } from "@/lib/tasks/search";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session?.user) return unauthorizedResponse();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const filter = (body.filter ?? {}) as FilterSpec;
  const sort = body.sort as SortSpec | undefined;
  const take = typeof body.take === "number" ? body.take : 200;

  try {
    const rows = await searchTasks(projectId, filter, sort, session.user.id, take);
    return NextResponse.json({ data: { items: rows } });
  } catch (e) {
    if (e instanceof TaskError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[tasks/search]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
