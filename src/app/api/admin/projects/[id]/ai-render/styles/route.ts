import { NextRequest, NextResponse } from "next/server";
import { requireStaffAccess, unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { DEFAULT_STYLE_PRESETS } from "@/lib/ai-render/style-presets";

export const runtime = "nodejs";

/**
 * GET /api/admin/projects/[id]/ai-render/styles
 * List all active style presets. Seeds defaults if table is empty.
 */
export async function GET(_request: NextRequest) {
  try {
    await requireStaffAccess();

    // Auto-seed: upsert all default presets so new ones get added
    // to existing DBs without losing user customizations.
    for (const p of DEFAULT_STYLE_PRESETS) {
      await prisma.aiStylePreset.upsert({
        where: { name: p.name },
        create: {
          name: p.name,
          label: p.label,
          description: p.description,
          category: p.category,
          prompt: p.prompt,
          negativePrompt: p.negativePrompt,
          sortOrder: p.sortOrder,
        },
        update: {},
      });
    }

    const presets = await prisma.aiStylePreset.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        label: true,
        description: true,
        thumbnailUrl: true,
        category: true,
      },
    });

    return NextResponse.json({ presets });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return unauthorizedResponse();
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
