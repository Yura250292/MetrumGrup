import { prisma } from "@/lib/prisma";

type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "STATUS_CHANGE" | "EXPORT" | "LOGIN";

export async function auditLog({
  userId,
  action,
  entity,
  entityId,
  projectId,
  oldData,
  newData,
  ipAddress,
}: {
  userId: string;
  action: AuditAction;
  entity: string;
  entityId?: string;
  projectId?: string;
  oldData?: object;
  newData?: object;
  ipAddress?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        projectId,
        oldData: oldData ? JSON.parse(JSON.stringify(oldData)) : undefined,
        newData: newData ? JSON.parse(JSON.stringify(newData)) : undefined,
        ipAddress,
      },
    });
  } catch (error) {
    console.error("Failed to create audit log:", error);
  }
}
