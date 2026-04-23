import type { Prisma, Warehouse } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type PrismaTx = Omit<Prisma.TransactionClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

/**
 * Find or create the warehouse that backs a specific project. Auto-created
 * warehouses are marked as the project's default and inherit the project title.
 * Existing global warehouses (projectId IS NULL) are NOT touched.
 */
export async function findOrCreateProjectWarehouse(
  projectId: string,
  client: PrismaTx | typeof prisma = prisma,
): Promise<Warehouse> {
  const existing = await client.warehouse.findFirst({
    where: { projectId, isActive: true },
    orderBy: { isDefault: "desc" },
  });
  if (existing) return existing;

  const project = await client.project.findUnique({
    where: { id: projectId },
    select: { id: true, title: true },
  });
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  return client.warehouse.create({
    data: {
      name: `Склад: ${project.title}`,
      projectId: project.id,
      isDefault: true,
      isActive: true,
    },
  });
}
