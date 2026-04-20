import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/users/[id]/public
 *
 * Returns public profile data for any user (visible to all authenticated staff).
 * Used for the "who is this person" popup triggered by clicking avatars
 * in chat, comments, task assignees, etc.
 *
 * Does NOT expose: password, notificationPrefs, workPrefs, productivityPrefs, integrations.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorizedResponse();

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      name: true,
      email: true,
      phone: true,
      avatar: true,
      bio: true,
      jobTitle: true,
      role: true,
      isActive: true,
      timezone: true,
      teamMemberships: {
        select: {
          team: {
            select: {
              id: true,
              name: true,
              department: { select: { name: true } },
            },
          },
        },
      },
      managedProjects: {
        where: { status: { not: "CANCELLED" } },
        select: { id: true, title: true },
        take: 5,
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // CLIENT users are not shown to staff (they're external, not team)
  if (user.role === "CLIENT" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const teams = user.teamMemberships.map((tm) => ({
    id: tm.team.id,
    name: tm.team.name,
    departmentName: tm.team.department?.name ?? null,
  }));

  return NextResponse.json({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    name: user.name,
    email: user.email,
    phone: user.phone,
    avatar: user.avatar,
    bio: user.bio,
    jobTitle: user.jobTitle,
    role: user.role,
    isActive: user.isActive,
    timezone: user.timezone,
    teams,
    managedProjects: user.managedProjects,
    isSelf: session.user.id === user.id,
  });
}
