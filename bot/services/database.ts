import { prisma } from '../../src/lib/prisma';
import { Role } from '@prisma/client';

export async function getUserProjects(userId: string, role: Role) {
  // CLIENT бачить тільки свої проекти
  if (role === 'CLIENT') {
    return prisma.project.findMany({
      where: { clientId: userId },
      include: { client: true, manager: true },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
  }

  // SUPER_ADMIN, MANAGER бачать всі
  if (['SUPER_ADMIN', 'MANAGER'].includes(role)) {
    return prisma.project.findMany({
      include: { client: true, manager: true },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
  }

  // ENGINEER, FINANCIER - проекти з активними кошторисами
  if (['ENGINEER', 'FINANCIER'].includes(role)) {
    return prisma.project.findMany({
      where: {
        estimates: {
          some: {
            OR: [
              { status: 'ENGINEER_REVIEW' },
              { status: 'FINANCE_REVIEW' }
            ]
          }
        }
      },
      include: { client: true, manager: true },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
  }

  return [];
}

export async function getProjectById(projectId: string, userId: string, role: Role) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      client: true,
      manager: true,
      estimates: {
        orderBy: { createdAt: 'desc' },
        take: 5
      },
      payments: {
        orderBy: { createdAt: 'desc' },
        take: 10
      }
    }
  });

  if (!project) return null;

  // Перевірка доступу
  if (role === 'CLIENT' && project.clientId !== userId) {
    return null;
  }

  return project;
}

export async function getEstimate(estimateNumber: string, userId: string, role: Role) {
  const estimate = await prisma.estimate.findUnique({
    where: { number: estimateNumber },
    include: {
      project: { include: { client: true } },
      sections: {
        include: { items: true },
        orderBy: { sortOrder: 'asc' }
      }
    }
  });

  if (!estimate) return null;

  // Перевірка доступу
  if (role === 'CLIENT' && estimate.project.clientId !== userId) {
    return null;
  }

  return estimate;
}

export async function getUserPayments(userId: string, role: Role) {
  // CLIENT бачить тільки свої платежі
  if (role === 'CLIENT') {
    return prisma.payment.findMany({
      where: {
        project: { clientId: userId }
      },
      include: { project: true },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
  }

  // Інші ролі - всі платежі
  if (['SUPER_ADMIN', 'MANAGER', 'FINANCIER'].includes(role)) {
    return prisma.payment.findMany({
      include: { project: true },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
  }

  return [];
}

export async function getMaterials(search?: string) {
  return prisma.material.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { sku: { contains: search, mode: 'insensitive' } },
            { category: { contains: search, mode: 'insensitive' } }
          ],
          isActive: true
        }
      : { isActive: true },
    orderBy: { name: 'asc' },
    take: 20
  });
}
