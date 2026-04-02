import { prisma } from './prisma';
import { createApprovalSignature, type ApprovalSignaturePayload } from './signature';
import { createEstimateVersion } from './versioning';

/**
 * Параметри для створення кроку апрувалу
 */
export interface CreateApprovalStepParams {
  estimateId: string;
  userId: string;
  stepType: 'ENGINEER_REVIEW' | 'FINANCE_REVIEW' | 'MANAGER_APPROVAL' | 'REJECTION';
  status: 'APPROVED' | 'REJECTED';
  notes?: string;
  metadata: {
    ipAddress?: string | null;
    userAgent?: string | null;
  };
}

/**
 * Створити крок апрувалу з цифровим підписом
 *
 * @param params - параметри апрувалу
 * @returns створений крок апрувалу з підписом
 */
export async function createApprovalStep(params: CreateApprovalStepParams) {
  const { estimateId, userId, stepType, status, notes, metadata } = params;

  // Отримати користувача для ролі
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, name: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Визначити тип події для версії
  let eventType: 'ENGINEER_APPROVED' | 'FINANCE_APPROVED' | 'REJECTED' | 'STATUS_CHANGED' =
    'STATUS_CHANGED';

  if (status === 'APPROVED') {
    if (stepType === 'ENGINEER_REVIEW') {
      eventType = 'ENGINEER_APPROVED';
    } else if (stepType === 'FINANCE_REVIEW') {
      eventType = 'FINANCE_APPROVED';
    }
  } else {
    eventType = 'REJECTED';
  }

  // Створити версію кошториса
  const version = await createEstimateVersion({
    estimateId,
    userId,
    eventType,
    description: notes || `${stepType}: ${status}`,
  });

  // Створити цифровий підпис
  const timestamp = new Date().toISOString();
  const estimateHash = version.snapshotHash;

  const signaturePayload: ApprovalSignaturePayload = {
    timestamp,
    userId,
    estimateId,
    estimateHash,
    metadata: {
      ipAddress: metadata.ipAddress || undefined,
      userAgent: metadata.userAgent || undefined,
    },
  };

  const signatureHash = createApprovalSignature(signaturePayload);

  // Зберегти крок апрувалу
  return prisma.estimateApprovalStep.create({
    data: {
      estimateId,
      versionId: version.id,
      stepType,
      status,
      reviewerRole: user.role,
      notes,
      signatureHash,
      signatureData: signaturePayload as any,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      reviewedById: userId,
    },
    include: {
      reviewer: {
        select: {
          name: true,
          email: true,
          role: true,
          avatar: true,
        },
      },
      version: {
        select: {
          versionNumber: true,
          eventType: true,
          snapshotHash: true,
        },
      },
    },
  });
}

/**
 * Отримати ланцюг апрувалів для кошториса
 *
 * @param estimateId - ID кошториса
 * @returns список апрувалів в хронологічному порядку
 */
export async function getApprovalChain(estimateId: string) {
  return prisma.estimateApprovalStep.findMany({
    where: { estimateId },
    include: {
      reviewer: {
        select: {
          name: true,
          email: true,
          role: true,
          avatar: true,
        },
      },
      version: {
        select: {
          versionNumber: true,
          eventType: true,
        },
      },
    },
    orderBy: { reviewedAt: 'asc' },
  });
}

/**
 * Верифікувати цілісність цифрового підпису апрувалу
 *
 * @param approvalId - ID апрувалу для верифікації
 * @returns результат верифікації
 */
export async function verifyApprovalIntegrity(approvalId: string) {
  const approval = await prisma.estimateApprovalStep.findUnique({
    where: { id: approvalId },
  });

  if (!approval) {
    throw new Error('Approval not found');
  }

  const { signatureHash, signatureData } = approval;

  // Перевірити підпис
  const expectedHash = createApprovalSignature(signatureData as unknown as ApprovalSignaturePayload);
  const isValid = signatureHash === expectedHash;

  return {
    approvalId,
    isValid,
    reviewedAt: approval.reviewedAt,
    reviewerId: approval.reviewedById,
    message: isValid
      ? 'Підпис валідний - дані не змінені'
      : 'УВАГА: Підпис невалідний - можлива підробка даних!',
  };
}

/**
 * Верифікувати всі підписи для кошториса
 *
 * @param estimateId - ID кошториса
 * @returns результати верифікації для кожного апрувалу
 */
export async function verifyAllApprovals(estimateId: string) {
  const approvals = await prisma.estimateApprovalStep.findMany({
    where: { estimateId },
  });

  const results = await Promise.all(
    approvals.map(async approval => {
      const verification = await verifyApprovalIntegrity(approval.id);
      return {
        ...verification,
        stepType: approval.stepType,
        status: approval.status,
      };
    })
  );

  const allValid = results.every(r => r.isValid);

  return {
    estimateId,
    totalApprovals: results.length,
    allValid,
    results,
  };
}

/**
 * Отримати останній апрувал певного типу
 *
 * @param estimateId - ID кошториса
 * @param stepType - тип апрувалу
 * @returns останній апрувал або null
 */
export async function getLatestApprovalByType(
  estimateId: string,
  stepType: 'ENGINEER_REVIEW' | 'FINANCE_REVIEW' | 'MANAGER_APPROVAL'
) {
  return prisma.estimateApprovalStep.findFirst({
    where: {
      estimateId,
      stepType,
    },
    orderBy: { reviewedAt: 'desc' },
    include: {
      reviewer: {
        select: {
          name: true,
          email: true,
          role: true,
        },
      },
    },
  });
}
