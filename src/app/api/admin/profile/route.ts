import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorizedResponse();

  try {
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
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
      timezone: true,
      locale: true,
      dateFormat: true,
      weekStartsOn: true,
      defaultTaskView: true,
      defaultLandingPage: true,
      notificationPrefsJson: true,
      workPrefsJson: true,
      productivityPrefsJson: true,
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
      projectMemberships: {
        select: {
          roleInProject: true,
          project: { select: { id: true, title: true } },
        },
        take: 20,
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const teams = user.teamMemberships.map((tm) => ({
    id: tm.team.id,
    name: tm.team.name,
    departmentName: tm.team.department?.name ?? undefined,
  }));

  const projectRoles = user.projectMemberships.map((pm) => ({
    projectId: pm.project.id,
    projectTitle: pm.project.title,
    role: pm.roleInProject,
  }));

  // Compute profile completeness
  let filled = 0;
  const total = 7;
  if (user.firstName) filled++;
  if (user.lastName) filled++;
  if (user.avatar) filled++;
  if (user.jobTitle) filled++;
  if (user.bio) filled++;
  if (user.timezone) filled++;
  if (user.notificationPrefsJson) filled++;
  const profileCompleteness = Math.round((filled / total) * 100);

  return NextResponse.json({
    ...user,
    teamMemberships: undefined,
    projectMemberships: undefined,
    teams,
    projectRoles,
    profileCompleteness,
  });
  } catch (error) {
    console.error("GET /api/admin/profile error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
  const session = await auth();
  if (!session?.user?.id) return unauthorizedResponse();

  const body = await request.json();

  // Allowed fields
  const allowed = [
    "firstName", "lastName", "phone", "jobTitle", "bio",
    "timezone", "locale", "dateFormat", "weekStartsOn",
    "defaultTaskView", "defaultLandingPage",
  ];

  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) {
      data[key] = body[key];
    }
  }

  // Validation
  if ("firstName" in data && (!data.firstName || typeof data.firstName !== "string")) {
    return NextResponse.json({ error: "Ім'я обов'язкове" }, { status: 400 });
  }
  if ("lastName" in data && (!data.lastName || typeof data.lastName !== "string")) {
    return NextResponse.json({ error: "Прізвище обов'язкове" }, { status: 400 });
  }
  if ("bio" in data && typeof data.bio === "string" && data.bio.length > 1000) {
    return NextResponse.json({ error: "Біо не може перевищувати 1000 символів" }, { status: 400 });
  }

  // Auto-compute name from firstName + lastName
  if ("firstName" in data || "lastName" in data) {
    const current = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { firstName: true, lastName: true },
    });
    const fn = (data.firstName as string) ?? current?.firstName ?? "";
    const ln = (data.lastName as string) ?? current?.lastName ?? "";
    data.name = [fn, ln].filter(Boolean).join(" ");
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data,
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
      timezone: true,
      locale: true,
      dateFormat: true,
      weekStartsOn: true,
      defaultTaskView: true,
      defaultLandingPage: true,
      notificationPrefsJson: true,
      workPrefsJson: true,
      productivityPrefsJson: true,
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
      projectMemberships: {
        select: {
          roleInProject: true,
          project: { select: { id: true, title: true } },
        },
        take: 20,
      },
    },
  });

  const teams = updated.teamMemberships.map((tm) => ({
    id: tm.team.id,
    name: tm.team.name,
    departmentName: tm.team.department?.name ?? undefined,
  }));

  const projectRoles = updated.projectMemberships.map((pm) => ({
    projectId: pm.project.id,
    projectTitle: pm.project.title,
    role: pm.roleInProject,
  }));

  // Re-compute completeness
  let filled = 0;
  const total = 7;
  if (updated.firstName) filled++;
  if (updated.lastName) filled++;
  if (updated.avatar) filled++;
  if (updated.jobTitle) filled++;
  if (updated.bio) filled++;
  if (updated.timezone) filled++;
  if (updated.notificationPrefsJson) filled++;

  return NextResponse.json({
    ...updated,
    teamMemberships: undefined,
    projectMemberships: undefined,
    teams,
    projectRoles,
    profileCompleteness: Math.round((filled / total) * 100),
  });
  } catch (error) {
    console.error("PATCH /api/admin/profile error:", error);
    return NextResponse.json(
      { error: "Помилка сервера" },
      { status: 500 }
    );
  }
}
