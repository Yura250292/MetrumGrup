import { prisma } from './prisma';
import { createSnapshotHash } from './signature';
import { EstimateStatus } from '@prisma/client';

/**
 * Параметри для створення версії кошториса
 */
export interface CreateEstimateVersionParams {
  estimateId: string;
  userId: string;
  eventType: 'CREATED' | 'STATUS_CHANGED' | 'ENGINEER_APPROVED' | 'FINANCE_APPROVED' | 'REJECTED';
  description?: string;
}

/**
 * Створити нову версію кошториса з фінансовим snapshot
 *
 * @param params - параметри створення версії
 * @returns створена версія
 */
export async function createEstimateVersion(params: CreateEstimateVersionParams) {
  const { estimateId, userId, eventType, description } = params;

  // Отримати поточний кошторис з усіма деталями
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: {
      sections: {
        include: {
          items: true,
        },
      },
    },
  });

  if (!estimate) {
    throw new Error('Estimate not found');
  }

  // Створити фінансовий snapshot (тільки ключові дані)
  const financialSnapshot = {
    totalAmount: estimate.totalAmount.toString(),
    finalAmount: estimate.finalAmount.toString(),
    finalClientPrice: estimate.finalClientPrice.toString(),
    discount: estimate.discount.toString(),
    totalMaterials: estimate.totalMaterials.toString(),
    totalLabor: estimate.totalLabor.toString(),
    profitMarginOverall: estimate.profitMarginOverall.toString(),
    taxationType: estimate.taxationType,
    pdvAmount: estimate.pdvAmount.toString(),
    itemsCount: estimate.sections.reduce((sum, s) => sum + s.items.length, 0),
    sectionsCount: estimate.sections.length,
  };

  const snapshotHash = createSnapshotHash(financialSnapshot);

  // Отримати наступний номер версії
  const lastVersion = await prisma.estimateVersion.findFirst({
    where: { estimateId },
    orderBy: { versionNumber: 'desc' },
  });

  const versionNumber = (lastVersion?.versionNumber || 0) + 1;

  // Створити версію
  return prisma.estimateVersion.create({
    data: {
      estimateId,
      versionNumber,
      eventType,
      status: estimate.status,
      financialSnapshot,
      snapshotHash,
      changeDescription: description,
      createdById: userId,
    },
    include: {
      createdBy: {
        select: {
          name: true,
          email: true,
          role: true,
        },
      },
    },
  });
}

/**
 * Отримати історію версій кошториса
 *
 * @param estimateId - ID кошториса
 * @returns список версій (найновіші зверху)
 */
export async function getVersionHistory(estimateId: string) {
  return prisma.estimateVersion.findMany({
    where: { estimateId },
    include: {
      createdBy: {
        select: {
          name: true,
          email: true,
          role: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Отримати конкретну версію
 *
 * @param versionId - ID версії
 * @returns версія або null
 */
export async function getVersion(versionId: string) {
  return prisma.estimateVersion.findUnique({
    where: { id: versionId },
    include: {
      createdBy: {
        select: {
          name: true,
          email: true,
          role: true,
        },
      },
    },
  });
}

/**
 * Порівняти дві версії кошториса
 *
 * @param versionId1 - ID першої версії
 * @param versionId2 - ID другої версії
 * @returns об'єкт з обома версіями та різницями
 */
export async function compareVersions(versionId1: string, versionId2: string) {
  const [v1, v2] = await Promise.all([
    prisma.estimateVersion.findUnique({
      where: { id: versionId1 },
      include: {
        createdBy: {
          select: { name: true, email: true, role: true },
        },
      },
    }),
    prisma.estimateVersion.findUnique({
      where: { id: versionId2 },
      include: {
        createdBy: {
          select: { name: true, email: true, role: true },
        },
      },
    }),
  ]);

  if (!v1 || !v2) {
    throw new Error('Version not found');
  }

  const diff = calculateDiff(v1.financialSnapshot, v2.financialSnapshot);

  return {
    version1: v1,
    version2: v2,
    diff,
  };
}

/**
 * Розрахувати різницю між двома snapshots
 *
 * @param snapshot1 - перший snapshot
 * @param snapshot2 - другий snapshot
 * @returns масив змін
 */
function calculateDiff(snapshot1: any, snapshot2: any) {
  const diff: Array<{
    field: string;
    oldValue: any;
    newValue: any;
    change?: string;
  }> = [];

  // Порівняти фінансові поля
  const fieldsToCompare = [
    'totalAmount',
    'finalAmount',
    'finalClientPrice',
    'discount',
    'totalMaterials',
    'totalLabor',
    'profitMarginOverall',
    'pdvAmount',
    'taxationType',
    'itemsCount',
    'sectionsCount',
  ];

  fieldsToCompare.forEach(field => {
    const val1 = snapshot1[field];
    const val2 = snapshot2[field];

    if (val1 !== val2) {
      const diffEntry: any = {
        field,
        oldValue: val1,
        newValue: val2,
      };

      // Розрахувати зміну для числових полів
      if (
        typeof val1 === 'string' &&
        typeof val2 === 'string' &&
        !isNaN(parseFloat(val1)) &&
        !isNaN(parseFloat(val2))
      ) {
        const num1 = parseFloat(val1);
        const num2 = parseFloat(val2);
        const changeAmount = num2 - num1;
        const changePercent = num1 !== 0 ? ((changeAmount / num1) * 100).toFixed(2) : '0';

        diffEntry.change = `${changeAmount > 0 ? '+' : ''}${changeAmount.toFixed(2)} (${changePercent}%)`;
      }

      diff.push(diffEntry);
    }
  });

  return diff;
}

/**
 * Отримати останню версію кошториса
 *
 * @param estimateId - ID кошториса
 * @returns остання версія або null
 */
export async function getLatestVersion(estimateId: string) {
  return prisma.estimateVersion.findFirst({
    where: { estimateId },
    orderBy: { versionNumber: 'desc' },
    include: {
      createdBy: {
        select: {
          name: true,
          email: true,
          role: true,
        },
      },
    },
  });
}
