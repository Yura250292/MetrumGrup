import { prisma } from "@/lib/prisma";
import { notifyUsers, type ProjectNotificationType } from "./create";
import { listActiveMembers } from "@/lib/projects/members-service";

type COLite = {
  id: string;
  number: string;
  title: string;
  projectId: string;
  requestedById: string;
  status: string;
};

async function pmIds(projectId: string): Promise<string[]> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { managerId: true },
  });
  return project?.managerId ? [project.managerId] : [];
}

async function superAdminIds(): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { role: "SUPER_ADMIN", isActive: true },
    select: { id: true },
  });
  return admins.map((a) => a.id);
}

async function clientUserIds(projectId: string): Promise<string[]> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { clientId: true },
  });
  return project?.clientId ? [project.clientId] : [];
}

async function stakeholders(projectId: string): Promise<string[]> {
  const members = await listActiveMembers(projectId);
  return Array.from(new Set(members.map((m) => m.userId).filter(Boolean) as string[]));
}

async function emit(opts: {
  userIds: string[];
  actorId: string;
  type: ProjectNotificationType;
  title: string;
  body?: string;
  co: COLite;
}): Promise<void> {
  if (opts.userIds.length === 0) return;
  await notifyUsers({
    userIds: opts.userIds,
    actorId: opts.actorId,
    type: opts.type,
    title: opts.title,
    body: opts.body,
    relatedEntity: "ChangeOrder",
    relatedId: opts.co.id,
    skipActor: true,
  });
}

export async function notifyCOSubmitted(co: COLite, actorId: string): Promise<void> {
  await emit({
    userIds: await pmIds(co.projectId),
    actorId,
    type: "CHANGE_ORDER_SUBMITTED",
    title: `Дод. угода ${co.number} подана на затвердження`,
    body: co.title,
    co,
  });
}

export async function notifyCOPMApproved(co: COLite, actorId: string): Promise<void> {
  await emit({
    userIds: await superAdminIds(),
    actorId,
    type: "CHANGE_ORDER_PM_APPROVED",
    title: `Дод. угода ${co.number}: PM затвердив, очікує SUPER_ADMIN`,
    body: co.title,
    co,
  });
}

export async function notifyCOAdminApproved(co: COLite, actorId: string): Promise<void> {
  await emit({
    userIds: await clientUserIds(co.projectId),
    actorId,
    type: "CHANGE_ORDER_ADMIN_APPROVED",
    title: `Дод. угода ${co.number} очікує вашого підтвердження`,
    body: co.title,
    co,
  });
}

export async function notifyCOApproved(co: COLite, actorId: string): Promise<void> {
  await emit({
    userIds: await stakeholders(co.projectId),
    actorId,
    type: "CHANGE_ORDER_APPROVED",
    title: `Дод. угода ${co.number} затверджена`,
    body: co.title,
    co,
  });
}

export async function notifyCORejected(
  co: COLite,
  actorId: string,
  reason: string | null,
): Promise<void> {
  await emit({
    userIds: [co.requestedById],
    actorId,
    type: "CHANGE_ORDER_REJECTED",
    title: `Дод. угода ${co.number} відхилена`,
    body: reason ?? co.title,
    co,
  });
}

export async function notifyCOCancelled(co: COLite, actorId: string): Promise<void> {
  await emit({
    userIds: await pmIds(co.projectId),
    actorId,
    type: "CHANGE_ORDER_CANCELLED",
    title: `Дод. угода ${co.number} скасована`,
    body: co.title,
    co,
  });
}
