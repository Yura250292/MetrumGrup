import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({
  dir: './',
})

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jest-environment-node',

  // Модульні тести для src/lib/**
  testMatch: [
    '<rootDir>/src/lib/**/__tests__/**/*.test.ts',
    '<rootDir>/src/lib/**/*.test.ts',
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

  // Thresholds для coverage
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
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
