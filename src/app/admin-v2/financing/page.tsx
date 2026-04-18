import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FinancingView } from "./_components/financing-view";

export const dynamic = "force-dynamic";

export default async function AdminV2FinancingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const allowedRoles = ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"];
  if (!allowedRoles.includes(session.user.role)) {
    redirect("/admin-v2");
  }

  const [projects, users] = await Promise.all([
    prisma.project.findMany({
      where: { status: { in: ["DRAFT", "ACTIVE", "ON_HOLD"] } },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
    prisma.user.findMany({
      where: { role: { in: ["SUPER_ADMIN", "MANAGER", "FINANCIER", "ENGINEER"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <FinancingView
      projects={projects}
      users={users.map((u) => ({ id: u.id, name: u.name ?? "Без імені" }))}
      currentUserId={session.user.id}
      currentUserName={session.user.name ?? session.user.email ?? "Ви"}
    />
  );
}
