import crypto from 'crypto';

/**
 * Payload для створення цифрового підпису апрувалу
 */
export interface ApprovalSignaturePayload {
  timestamp: string;
  userId: string;
  estimateId: string;
  estimateHash: string;
  metadata: {
    ipAddress?: string;
    userAgent?: string;
  };
}

/**
 * Створити цифровий підпис для апрувалу кошторису
 * Використовує SHA-256 хеш з salt для забезпечення безпеки
 *
 * @param payload - дані для підпису
 * @returns SHA-256 хеш у hex форматі (64 символи)
 */
export function createApprovalSignature(payload: ApprovalSignaturePayload): string {
  // Сортувати ключі для консистентності
  const sortedPayload = {
    timestamp: payload.timestamp,
    userId: payload.userId,
    estimateId: payload.estimateId,
    estimateHash: payload.estimateHash,
    metadata: payload.metadata,
  };

  const data = JSON.stringify(sortedPayload, Object.keys(sortedPayload).sort());
  const salt = process.env.SIGNATURE_SALT || 'default-salt-change-in-production';

  return crypto
    .createHash('sha256')
    .update(data + salt)
    .digest('hex');
}

/**
 * Верифікувати цифровий підпис
 *
 * @param hash - існуючий підпис для перевірки
 * @param payload - оригінальні дані
 * @returns true якщо підпис валідний, false якщо підпис змінений
 */
export function verifySignature(
  hash: string,
  payload: ApprovalSignaturePayload
): boolean {
  const expectedHash = createApprovalSignature(payload);
  return hash === expectedHash;
}

/**
 * Створити хеш для фінансового snapshot
 * Використовується для верифікації незмінності даних
 *
 * @param snapshot - об'єкт з фінансовими даними
 * @returns SHA-256 хеш у hex форматі
 */
export function createSnapshotHash(snapshot: any): string {
  // Сортувати ключі для консистентності
  const sortedKeys = Object.keys(snapshot).sort();
  const sortedSnapshot: Record<string, any> = {};

  sortedKeys.forEach(key => {
    sortedSnapshot[key] = snapshot[key];
  });

  const data = JSON.stringify(sortedSnapshot);

  return crypto
    .createHash('sha256')
    .update(data)
    .digest('hex');
}

/**
 * Створити унікальний хеш для estimate (використовується в підписах)
 *
 * @param estimateData - дані кошторису
 * @returns SHA-256 хеш
 */
export function createEstimateHash(estimateData: {
  id: string;
  totalAmount: number | string;
  finalAmount: number | string;
  status: string;
}): string {
  const data = JSON.stringify({
    id: estimateData.id,
    totalAmount: estimateData.totalAmount.toString(),
    finalAmount: estimateData.finalAmount.toString(),
    status: estimateData.status,
  });

  return crypto
    .createHash('sha256')
    .update(data)
    .digest('hex');
}
