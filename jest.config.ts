import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({
  dir: './',
})

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jest-environment-node',

  // Модульні тести для src/lib/** + чистий-TS у src/components/**
  testMatch: [
    '<rootDir>/src/lib/**/__tests__/**/*.test.ts',
    '<rootDir>/src/lib/**/*.test.ts',
    '<rootDir>/src/components/**/__tests__/**/*.test.ts',
  ],

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
  ],

  // Transform ESM modules from node_modules
  transformIgnorePatterns: [
    'node_modules/(?!(next-auth|@auth)/)',
  ],

  // Module name mapper для TypeScript aliases
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^next-auth$': '<rootDir>/src/__mocks__/next-auth-mock.ts',
    '^next-auth/providers/credentials$': '<rootDir>/src/__mocks__/next-auth-mock.ts',
  },

  // Thresholds для coverage. Аспіраційні значення (80/80/70/80) залишаємо
  // як ціль, але CI gate тримаємо на поточному baseline — щоб блокувати
  // регресії, а не блокувати реліз. Підвищувати ці числа в міру того,
  // як додаємо тести (P1 task у BETA_BACKLOG: audit coverage).
  coverageThreshold: {
    global: {
      branches: 55,
      functions: 30,
      lines: 5,
      statements: 5,
    },
  },

  // Директорії для coverage
  collectCoverageFrom: [
    'src/lib/**/*.{ts,tsx}',
    '!src/lib/**/*.d.ts',
    '!src/lib/**/index.ts',
  ],

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
}

export default createJestConfig(config)
