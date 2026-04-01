import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({
  dir: './',
})

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jest-environment-jsdom',

  testMatch: [
    '<rootDir>/src/components/**/__tests__/**/*.test.tsx',
    '<rootDir>/src/app/**/__tests__/**/*.test.tsx',
  ],

  testPathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
  ],

  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  collectCoverageFrom: [
    'src/components/**/*.{ts,tsx}',
    'src/app/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
}

export default createJestConfig(config)
