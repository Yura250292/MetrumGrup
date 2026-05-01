// Manual mock — Jest автоматично використовує цей файл, коли тест викликає
// jest.mock("@/lib/prisma"). Шейпи зростають точково під потреби тестів.
import { jest } from "@jest/globals";

export const prisma = {
  financeEntry: {
    findMany: jest.fn(),
    groupBy: jest.fn(),
  },
  project: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  projectStageRecord: {
    findMany: jest.fn(),
  },
  $executeRaw: jest.fn(),
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
};
