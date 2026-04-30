// Manual mock — Jest автоматично використовує цей файл, коли тест викликає
// jest.mock("@/lib/prisma"). Шейпи зростають точково під потреби тестів.
import { jest } from "@jest/globals";

export const prisma = {
  financeEntry: {
    findMany: jest.fn(),
    groupBy: jest.fn(),
  },
};
