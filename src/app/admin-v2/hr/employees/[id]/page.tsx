import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EmployeeDossier } from "../_components/employee-dossier";

export const dynamic = "force-dynamic";

const ALLOWED = ["SUPER_ADMIN", "MANAGER", "HR"];

export default async function EmployeeDossierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!ALLOWED.includes(session.user.role)) redirect("/admin-v2");

  const { id } = await params;
  const exists = await prisma.employee.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) notFound();

  return <EmployeeDossier id={id} currentUserRole={session.user.role} />;
}
